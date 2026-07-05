package agent

import "encoding/json"

// Message is the provider-neutral, AI SDK UI compatible message shape used by
// the chat package and persisted by the application.
type Message struct {
	ID       string         `json:"id"`
	Role     string         `json:"role"`
	Metadata map[string]any `json:"metadata,omitempty"`
	Parts    []Part         `json:"parts"`
}

// Part is a finalized UI message part. Keeping this as a JSON object lets the
// Go backend preserve AI SDK additions without coupling persistence to a
// provider-specific block model.
type Part map[string]any

// StreamChunk mirrors the AI SDK UI Message Stream v1 JSON protocol. Only
// fields relevant to the current chat implementation are represented.
type StreamChunk struct {
	Type string `json:"type"`

	ID        string `json:"id,omitempty"`
	Delta     string `json:"delta,omitempty"`
	MessageID string `json:"messageId,omitempty"`

	ToolCallID       string `json:"toolCallId,omitempty"`
	ToolName         string `json:"toolName,omitempty"`
	InputTextDelta   string `json:"inputTextDelta,omitempty"`
	Input            any    `json:"input,omitempty"`
	Output           any    `json:"output,omitempty"`
	ErrorText        string `json:"errorText,omitempty"`
	Reason           string `json:"reason,omitempty"`
	Dynamic          bool   `json:"dynamic,omitempty"`
	ProviderExecuted bool   `json:"providerExecuted,omitempty"`

	SourceID  string `json:"sourceId,omitempty"`
	URL       string `json:"url,omitempty"`
	Title     string `json:"title,omitempty"`
	MediaType string `json:"mediaType,omitempty"`
	Filename  string `json:"filename,omitempty"`

	FinishReason     string         `json:"finishReason,omitempty"`
	MessageMetadata  map[string]any `json:"messageMetadata,omitempty"`
	ProviderMetadata map[string]any `json:"providerMetadata,omitempty"`
}

// MarshalJSON guarantees that nil metadata is omitted while arbitrary input
// and output values remain regular JSON values.
func (c StreamChunk) MarshalJSON() ([]byte, error) {
	type alias StreamChunk
	data, err := json.Marshal(alias(c))
	if err != nil {
		return nil, err
	}
	var value map[string]any
	if err := json.Unmarshal(data, &value); err != nil {
		return nil, err
	}
	switch c.Type {
	case "tool-input-available", "tool-input-error":
		value["input"] = c.Input
	case "tool-output-available":
		value["output"] = c.Output
	}
	return json.Marshal(value)
}

type ModelConfig struct {
	ID       string
	Name     string
	ModelID  string
	BaseURL  string
	APIKey   string
	Protocol string
}

type Usage struct {
	InputTokens         int64 `json:"inputTokens"`
	OutputTokens        int64 `json:"outputTokens"`
	TotalTokens         int64 `json:"totalTokens"`
	ReasoningTokens     int64 `json:"reasoningTokens"`
	CacheCreationTokens int64 `json:"cacheCreationTokens"`
	CacheReadTokens     int64 `json:"cacheReadTokens"`
}

type Result struct {
	Usage        Usage
	FinishReason string
	StepCount    int
}
