package chat

import (
	"testing"

	workagent "github.com/xusenlin/workavera/internal/agent"
)

func TestMessageReducerBuildsUIMessageParts(t *testing.T) {
	reducer := newMessageReducer("message-1")
	chunks := []workagent.StreamChunk{
		{Type: "start-step"},
		{Type: "reasoning-start", ID: "reasoning-1"},
		{Type: "reasoning-delta", ID: "reasoning-1", Delta: "checking"},
		{Type: "reasoning-end", ID: "reasoning-1"},
		{Type: "tool-input-start", ToolCallID: "call-1", ToolName: "lookup", Dynamic: true},
		{Type: "tool-input-delta", ToolCallID: "call-1", InputTextDelta: `{"id":`},
		{Type: "tool-input-available", ToolCallID: "call-1", ToolName: "lookup", Input: map[string]any{"id": float64(7)}, Dynamic: true},
		{Type: "tool-output-available", ToolCallID: "call-1", Output: map[string]any{"name": "result"}, Dynamic: true},
		{Type: "text-start", ID: "text-1"},
		{Type: "text-delta", ID: "text-1", Delta: "Hello "},
		{Type: "text-delta", ID: "text-1", Delta: "world"},
		{Type: "text-end", ID: "text-1"},
	}
	for _, chunk := range chunks {
		reducer.Apply(chunk)
	}

	message := reducer.Snapshot()
	if message.ID != "message-1" || message.Role != "assistant" {
		t.Fatalf("unexpected message: %#v", message)
	}
	if len(message.Parts) != 4 {
		t.Fatalf("expected 4 parts, got %#v", message.Parts)
	}
	if message.Parts[1]["type"] != "reasoning" || message.Parts[1]["text"] != "checking" || message.Parts[1]["state"] != "done" {
		t.Fatalf("unexpected reasoning part: %#v", message.Parts[1])
	}
	tool := message.Parts[2]
	if tool["type"] != "dynamic-tool" || tool["state"] != "output-available" || tool["toolCallId"] != "call-1" {
		t.Fatalf("unexpected tool part: %#v", tool)
	}
	if message.Parts[3]["text"] != "Hello world" || message.Parts[3]["state"] != "done" {
		t.Fatalf("unexpected text part: %#v", message.Parts[3])
	}
}

func TestUnsubscribeDoesNotCancelRun(t *testing.T) {
	cancelled := false
	run := newActiveRun("run-1", "owner-1", func() { cancelled = true })
	subscriber := run.subscribe()
	run.unsubscribe(subscriber)
	run.publish(workagent.StreamChunk{Type: "text-delta", ID: "text-1", Delta: "still running"})
	if cancelled {
		t.Fatal("disconnecting a subscriber must not cancel the background run")
	}
	run.cancel()
	if !cancelled {
		t.Fatal("explicit cancellation must cancel the run")
	}
}
