package chat

import (
	"strings"
	"sync"

	workagent "github.com/xusenlin/workavera/internal/agent"
)

type messageReducer struct {
	mu        sync.Mutex
	message   workagent.Message
	active    map[string]int
	toolInput map[string]string
}

func newMessageReducer(messageID string) *messageReducer {
	return &messageReducer{
		message:   workagent.Message{ID: messageID, Role: "assistant", Parts: []workagent.Part{}},
		active:    make(map[string]int),
		toolInput: make(map[string]string),
	}
}

func (r *messageReducer) Apply(chunk workagent.StreamChunk) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Data parts are upserted by id: repeated chunks with the same id replace
	// the payload in place, mirroring the AI SDK client behavior.
	if strings.HasPrefix(chunk.Type, "data-") {
		key := chunk.Type + ":" + chunk.ID
		if index, ok := r.active[key]; ok && index < len(r.message.Parts) {
			r.message.Parts[index]["data"] = chunk.Data
			return
		}
		part := workagent.Part{"type": chunk.Type, "data": chunk.Data}
		if chunk.ID != "" {
			part["id"] = chunk.ID
		}
		r.active[key] = len(r.message.Parts)
		r.message.Parts = append(r.message.Parts, part)
		return
	}

	switch chunk.Type {
	case "start-step":
		r.message.Parts = append(r.message.Parts, workagent.Part{"type": "step-start"})
	case "text-start":
		r.active["text:"+chunk.ID] = len(r.message.Parts)
		r.message.Parts = append(r.message.Parts, workagent.Part{"type": "text", "text": "", "state": "streaming"})
	case "text-delta":
		r.appendText("text:"+chunk.ID, chunk.Delta)
	case "text-end":
		r.finishPart("text:" + chunk.ID)
	case "reasoning-start":
		r.active["reasoning:"+chunk.ID] = len(r.message.Parts)
		r.message.Parts = append(r.message.Parts, workagent.Part{"type": "reasoning", "text": "", "state": "streaming"})
	case "reasoning-delta":
		r.appendText("reasoning:"+chunk.ID, chunk.Delta)
	case "reasoning-end":
		if len(chunk.ProviderMetadata) > 0 {
			r.setPartField("reasoning:"+chunk.ID, "providerMetadata", chunk.ProviderMetadata)
		}
		r.finishPart("reasoning:" + chunk.ID)
	case "tool-input-start":
		r.active["tool:"+chunk.ToolCallID] = len(r.message.Parts)
		r.toolInput[chunk.ToolCallID] = ""
		r.message.Parts = append(r.message.Parts, workagent.Part{
			"type": "dynamic-tool", "toolCallId": chunk.ToolCallID, "toolName": chunk.ToolName,
			"state": "input-streaming", "providerExecuted": chunk.ProviderExecuted,
		})
	case "tool-input-delta":
		r.toolInput[chunk.ToolCallID] += chunk.InputTextDelta
	case "tool-input-available", "tool-input-error":
		part := r.toolPart(chunk.ToolCallID, chunk.ToolName)
		part["input"] = chunk.Input
		part["providerExecuted"] = chunk.ProviderExecuted
		if len(chunk.ProviderMetadata) > 0 {
			part["callProviderMetadata"] = chunk.ProviderMetadata
		}
		if chunk.Type == "tool-input-error" {
			part["state"] = "output-error"
			part["errorText"] = chunk.ErrorText
		} else {
			part["state"] = "input-available"
		}
		delete(r.toolInput, chunk.ToolCallID)
	case "tool-output-available", "tool-output-error":
		part := r.toolPart(chunk.ToolCallID, chunk.ToolName)
		part["providerExecuted"] = chunk.ProviderExecuted
		if len(chunk.ProviderMetadata) > 0 {
			part["resultProviderMetadata"] = chunk.ProviderMetadata
		}
		if chunk.Type == "tool-output-error" {
			part["state"] = "output-error"
			part["errorText"] = chunk.ErrorText
		} else {
			part["state"] = "output-available"
			part["output"] = chunk.Output
		}
	case "source-url":
		r.message.Parts = append(r.message.Parts, workagent.Part{"type": "source-url", "sourceId": chunk.SourceID, "url": chunk.URL, "title": chunk.Title})
	case "source-document":
		r.message.Parts = append(r.message.Parts, workagent.Part{"type": "source-document", "sourceId": chunk.SourceID, "mediaType": chunk.MediaType, "title": chunk.Title, "filename": chunk.Filename})
	case "file":
		r.message.Parts = append(r.message.Parts, workagent.Part{"type": "file", "url": chunk.URL, "mediaType": chunk.MediaType})
	}
}

func (r *messageReducer) appendText(key, delta string) {
	index, ok := r.active[key]
	if !ok || index >= len(r.message.Parts) {
		return
	}
	text, _ := r.message.Parts[index]["text"].(string)
	r.message.Parts[index]["text"] = text + delta
}

func (r *messageReducer) finishPart(key string) {
	index, ok := r.active[key]
	if !ok || index >= len(r.message.Parts) {
		return
	}
	r.message.Parts[index]["state"] = "done"
	delete(r.active, key)
}

func (r *messageReducer) setPartField(key, field string, value any) {
	index, ok := r.active[key]
	if !ok || index >= len(r.message.Parts) {
		return
	}
	r.message.Parts[index][field] = value
}

func (r *messageReducer) toolPart(callID, toolName string) workagent.Part {
	key := "tool:" + callID
	if index, ok := r.active[key]; ok && index < len(r.message.Parts) {
		return r.message.Parts[index]
	}
	part := workagent.Part{"type": "dynamic-tool", "toolCallId": callID, "toolName": toolName, "state": "input-available"}
	r.active[key] = len(r.message.Parts)
	r.message.Parts = append(r.message.Parts, part)
	return part
}

func (r *messageReducer) Snapshot() workagent.Message {
	r.mu.Lock()
	defer r.mu.Unlock()
	parts := make([]workagent.Part, len(r.message.Parts))
	for i, part := range r.message.Parts {
		clone := make(workagent.Part, len(part))
		for key, value := range part {
			clone[key] = value
		}
		parts[i] = clone
	}
	return workagent.Message{ID: r.message.ID, Role: r.message.Role, Metadata: r.message.Metadata, Parts: parts}
}

func shouldCheckpoint(chunk workagent.StreamChunk) bool {
	return strings.HasSuffix(chunk.Type, "-end") || chunk.Type == "tool-input-available" || chunk.Type == "tool-input-error" || strings.HasPrefix(chunk.Type, "tool-output-") || chunk.Type == "finish-step"
}
