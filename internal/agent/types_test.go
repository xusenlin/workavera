package agent

import (
	"encoding/json"
	"testing"

	"charm.land/fantasy"
	"charm.land/fantasy/providers/anthropic"
	"charm.land/fantasy/providers/google"
)

func TestStreamChunkToolNullValuesRemainProtocolValid(t *testing.T) {
	data, err := json.Marshal(StreamChunk{Type: "tool-input-available", ToolCallID: "call-1", ToolName: "lookup", Dynamic: true})
	if err != nil {
		t.Fatal(err)
	}
	var value map[string]any
	if err := json.Unmarshal(data, &value); err != nil {
		t.Fatal(err)
	}
	if _, ok := value["input"]; !ok {
		t.Fatalf("tool-input-available must include input: %s", data)
	}
	if _, ok := value["output"]; ok {
		t.Fatalf("tool-input-available must not include output: %s", data)
	}

	data, err = json.Marshal(StreamChunk{Type: "tool-output-available", ToolCallID: "call-1", Dynamic: true})
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &value); err != nil {
		t.Fatal(err)
	}
	if _, ok := value["output"]; !ok {
		t.Fatalf("tool-output-available must include output: %s", data)
	}
}

func TestToFantasyMessagesCombinesToolHistory(t *testing.T) {
	messages, err := toFantasyMessages([]Message{{
		Role: "assistant",
		Parts: []Part{{
			"type": "dynamic-tool", "toolCallId": "call-1", "toolName": "lookup",
			"state": "output-available", "input": map[string]any{"id": 7}, "output": map[string]any{"name": "result"},
		}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if len(messages) != 2 || messages[0].Role != "assistant" || messages[1].Role != "tool" {
		t.Fatalf("unexpected fantasy history: %#v", messages)
	}
}

func TestToFantasyMessagesKeepsProviderExecutedResultsWithAssistant(t *testing.T) {
	messages, err := toFantasyMessages([]Message{{
		Role: "assistant",
		Parts: []Part{{
			"type": "dynamic-tool", "toolCallId": "server-call-1", "toolName": "web_search",
			"state": "output-available", "input": map[string]any{"query": "workavera"},
			"output": map[string]any{"result": "ok"}, "providerExecuted": true,
		}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if len(messages) != 1 || messages[0].Role != fantasy.MessageRoleAssistant || len(messages[0].Content) != 2 {
		t.Fatalf("provider-executed result must stay beside its tool call: %#v", messages)
	}
	result, ok := messages[0].Content[1].(fantasy.ToolResultPart)
	if !ok || !result.ProviderExecuted {
		t.Fatalf("provider-executed marker was lost: %#v", messages[0].Content[1])
	}
}

func TestStreamChunkValidForWire(t *testing.T) {
	cases := []struct {
		name  string
		chunk StreamChunk
		want  bool
	}{
		// Empty/no-payload types: always valid.
		{"start", StreamChunk{Type: "start"}, true},
		{"finish", StreamChunk{Type: "finish"}, true},
		{"abort", StreamChunk{Type: "abort"}, true},
		{"start-step", StreamChunk{Type: "start-step"}, true},
		{"finish-step", StreamChunk{Type: "finish-step"}, true},

		// id-keyed lifecycle markers.
		{"text-start ok", StreamChunk{Type: "text-start", ID: "t1"}, true},
		{"text-start missing id", StreamChunk{Type: "text-start"}, false},
		{"text-end ok", StreamChunk{Type: "text-end", ID: "t1"}, true},
		{"reasoning-start ok", StreamChunk{Type: "reasoning-start", ID: "r1"}, true},
		{"reasoning-end ok", StreamChunk{Type: "reasoning-end", ID: "r1"}, true},

		// Deltas require id + non-empty content.
		{"text-delta ok", StreamChunk{Type: "text-delta", ID: "t1", Delta: "hi"}, true},
		{"text-delta empty content", StreamChunk{Type: "text-delta", ID: "t1", Delta: ""}, false},
		{"text-delta missing id", StreamChunk{Type: "text-delta", Delta: "hi"}, false},
		{"reasoning-delta ok", StreamChunk{Type: "reasoning-delta", ID: "r1", Delta: "thinking"}, true},
		{"reasoning-delta empty content", StreamChunk{Type: "reasoning-delta", ID: "r1", Delta: ""}, false},
		{"reasoning-delta missing id", StreamChunk{Type: "reasoning-delta", Delta: "thinking"}, false},

		// Tool input streaming.
		{"tool-input-start ok", StreamChunk{Type: "tool-input-start", ToolCallID: "c1", ToolName: "get_weather"}, true},
		{"tool-input-start missing toolName", StreamChunk{Type: "tool-input-start", ToolCallID: "c1"}, false},
		{"tool-input-delta ok", StreamChunk{Type: "tool-input-delta", ToolCallID: "c1", InputTextDelta: `{`}, true},
		{"tool-input-delta empty content", StreamChunk{Type: "tool-input-delta", ToolCallID: "c1", InputTextDelta: ""}, false},

		// Tool input finalized.
		{"tool-input-available ok", StreamChunk{Type: "tool-input-available", ToolCallID: "c1", ToolName: "get_weather", Input: map[string]any{"location": "南京"}}, true},
		{"tool-input-available null input", StreamChunk{Type: "tool-input-available", ToolCallID: "c1", ToolName: "get_weather"}, true},
		{"tool-input-error ok", StreamChunk{Type: "tool-input-error", ToolCallID: "c1", ToolName: "get_weather", Input: map[string]any{}, ErrorText: "bad"}, true},
		{"tool-input-error missing errorText", StreamChunk{Type: "tool-input-error", ToolCallID: "c1", ToolName: "get_weather", Input: map[string]any{}}, false},

		// Tool output.
		{"tool-output-available ok", StreamChunk{Type: "tool-output-available", ToolCallID: "c1", Output: "rain"}, true},
		{"tool-output-available null output", StreamChunk{Type: "tool-output-available", ToolCallID: "c1"}, true},
		{"tool-output-error ok", StreamChunk{Type: "tool-output-error", ToolCallID: "c1", ErrorText: "fail"}, true},
		{"tool-output-error missing errorText", StreamChunk{Type: "tool-output-error", ToolCallID: "c1"}, false},
		{"tool-output-denied ok", StreamChunk{Type: "tool-output-denied", ToolCallID: "c1"}, true},

		// Errors and metadata.
		{"error ok", StreamChunk{Type: "error", ErrorText: "boom"}, true},
		{"error missing text", StreamChunk{Type: "error"}, false},
		{"message-metadata ok", StreamChunk{Type: "message-metadata", MessageMetadata: map[string]any{"k": 1}}, true},
		{"message-metadata empty", StreamChunk{Type: "message-metadata"}, false},

		// Sources.
		{"source-url ok", StreamChunk{Type: "source-url", SourceID: "s1", URL: "https://x"}, true},
		{"source-url missing url", StreamChunk{Type: "source-url", SourceID: "s1"}, false},
		{"source-document ok", StreamChunk{Type: "source-document", SourceID: "s1", MediaType: "text/plain", Title: "doc"}, true},
		{"source-document missing title", StreamChunk{Type: "source-document", SourceID: "s1", MediaType: "text/plain"}, false},
		{"file ok", StreamChunk{Type: "file", URL: "https://x/file", MediaType: "text/plain"}, true},
		{"file missing media type", StreamChunk{Type: "file", URL: "https://x/file"}, false},

		// Unknown types are dropped defensively.
		{"unknown type", StreamChunk{Type: "something-new"}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := tc.chunk.ValidForWire(); got != tc.want {
				t.Fatalf("ValidForWire(%s) = %v, want %v", tc.chunk.Type, got, tc.want)
			}
		})
	}
}

func TestMetadataOnlyReasoningRoundTrip(t *testing.T) {
	originalMeta := fantasy.ProviderMetadata{
		google.Name: &google.ReasoningMetadata{Signature: "thought-signature", ToolID: "call-1"},
	}
	part := Part{
		"type":             "reasoning",
		"text":             "",
		"state":            "done",
		"providerMetadata": providerMetadataMap(originalMeta),
	}

	messages, err := toFantasyMessages([]Message{{Role: "assistant", Parts: []Part{part}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(messages) != 1 || len(messages[0].Content) != 1 {
		t.Fatalf("metadata-only reasoning was dropped: %#v", messages)
	}
	reasoning, ok := messages[0].Content[0].(fantasy.ReasoningPart)
	if !ok {
		t.Fatalf("expected ReasoningPart, got %T", messages[0].Content[0])
	}
	metadata := google.GetReasoningMetadata(reasoning.ProviderOptions)
	if metadata == nil || metadata.Signature != "thought-signature" || metadata.ToolID != "call-1" {
		t.Fatalf("reasoning metadata did not round-trip: %#v", metadata)
	}
}

// TestReasoningMetadataRoundTrip verifies that provider metadata (e.g. Anthropic
// thinking-block signatures) survives the full persist → rebuild cycle, so a
// reasoning part from a previous turn can be reconstructed into a thinking
// block on the next model request.
func TestReasoningMetadataRoundTrip(t *testing.T) {
	// Simulate the ProviderMetadata that OnReasoningEnd would capture.
	originalMeta := fantasy.ProviderMetadata{
		anthropic.Name: &anthropic.ReasoningOptionMetadata{Signature: "sig_abc123"},
	}
	raw, err := json.Marshal(originalMeta)
	if err != nil {
		t.Fatal(err)
	}
	var asAny map[string]any
	if err := json.Unmarshal(raw, &asAny); err != nil {
		t.Fatal(err)
	}

	// Simulate a persisted Part as it would come back from the database.
	part := Part{
		"type":             "reasoning",
		"text":             "I should check the weather",
		"state":            "done",
		"providerMetadata": asAny,
	}

	// Rebuild into fantasy messages.
	messages, err := toFantasyMessages([]Message{{
		Role:  "assistant",
		Parts: []Part{part},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if len(messages) != 1 || len(messages[0].Content) != 1 {
		t.Fatalf("unexpected messages: %#v", messages)
	}

	reasoningPart, ok := messages[0].Content[0].(fantasy.ReasoningPart)
	if !ok {
		t.Fatalf("expected ReasoningPart, got %T", messages[0].Content[0])
	}
	if reasoningPart.Text != "I should check the weather" {
		t.Fatalf("unexpected text: %q", reasoningPart.Text)
	}

	// The critical assertion: provider metadata must be restorable so the
	// Anthropic provider can reconstruct a thinking block.
	meta := anthropic.GetReasoningMetadata(reasoningPart.ProviderOptions)
	if meta == nil {
		t.Fatal("GetReasoningMetadata returned nil — provider metadata was lost during rebuild")
	}
	if meta.Signature != "sig_abc123" {
		t.Fatalf("expected signature sig_abc123, got %q", meta.Signature)
	}
}

// TestMultiStepToolCallRebuild verifies that a persisted assistant message
// containing two steps (step 1: reasoning → text → tool-call+result; step 2:
// reasoning → text) is rebuilt into the correct message sequence: the
// tool_result must immediately follow the assistant message that contains the
// tool_use, with no second-step content wedged between them. This is required
// by the Anthropic API contract enforced by providers like DeepSeek.
func TestMultiStepToolCallRebuild(t *testing.T) {
	msg := Message{
		Role: "assistant",
		Parts: []Part{
			Part{"type": "step-start"},
			Part{"type": "reasoning", "text": "need to check weather", "state": "done"},
			Part{"type": "text", "text": "let me look that up", "state": "done"},
			Part{"type": "dynamic-tool", "toolCallId": "call-1", "toolName": "get_weather",
				"state": "output-available", "input": map[string]any{"location": "南京"},
				"output": "小雨 22°C"},
			Part{"type": "step-start"},
			Part{"type": "reasoning", "text": "format the result", "state": "done"},
			Part{"type": "text", "text": "南京下雨，记得带伞。", "state": "done"},
		},
	}

	messages, err := toFantasyMessages([]Message{msg})
	if err != nil {
		t.Fatal(err)
	}

	// Expected: 3 messages — assistant(tool-use) → tool(result) → assistant(text)
	if len(messages) != 3 {
		t.Fatalf("expected 3 messages, got %d: %#v", len(messages), messages)
	}

	// Message 0: assistant with reasoning + text + tool-call (step 1)
	if messages[0].Role != fantasy.MessageRoleAssistant {
		t.Fatalf("msg[0] role = %s, want assistant", messages[0].Role)
	}
	if len(messages[0].Content) != 3 {
		t.Fatalf("msg[0] should have 3 parts (reasoning+text+toolcall), got %d", len(messages[0].Content))
	}
	if _, ok := messages[0].Content[2].(fantasy.ToolCallPart); !ok {
		t.Fatalf("msg[0] part[2] should be ToolCallPart, got %T", messages[0].Content[2])
	}

	// Message 1: tool result (immediately after the tool-use message)
	if messages[1].Role != fantasy.MessageRoleTool {
		t.Fatalf("msg[1] role = %s, want tool", messages[1].Role)
	}
	if len(messages[1].Content) != 1 {
		t.Fatalf("msg[1] should have 1 part, got %d", len(messages[1].Content))
	}
	result, ok := messages[1].Content[0].(fantasy.ToolResultPart)
	if !ok {
		t.Fatalf("msg[1] part[0] should be ToolResultPart, got %T", messages[1].Content[0])
	}
	if result.ToolCallID != "call-1" {
		t.Fatalf("msg[1] toolCallId = %s, want call-1", result.ToolCallID)
	}
	output, ok := result.Output.(fantasy.ToolResultOutputContentText)
	if !ok || output.Text != "小雨 22°C" {
		t.Fatalf("plain text tool output was not restored faithfully: %#v", result.Output)
	}

	// Message 2: assistant with reasoning + text (step 2 — after tool result)
	if messages[2].Role != fantasy.MessageRoleAssistant {
		t.Fatalf("msg[2] role = %s, want assistant", messages[2].Role)
	}
	if len(messages[2].Content) != 2 {
		t.Fatalf("msg[2] should have 2 parts (reasoning+text), got %d", len(messages[2].Content))
	}
	if _, ok := messages[2].Content[0].(fantasy.ReasoningPart); !ok {
		t.Fatalf("msg[2] part[0] should be ReasoningPart, got %T", messages[2].Content[0])
	}
	if textPart, ok := messages[2].Content[1].(fantasy.TextPart); !ok || textPart.Text != "南京下雨，记得带伞。" {
		t.Fatalf("msg[2] part[1] should be final text, got %#v", messages[2].Content[1])
	}
}
