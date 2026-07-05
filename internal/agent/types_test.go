package agent

import (
	"encoding/json"
	"testing"
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
