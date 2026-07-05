package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"charm.land/fantasy"
	"charm.land/fantasy/providers/anthropic"
	"charm.land/fantasy/providers/google"
	"charm.land/fantasy/providers/openai"
	"charm.land/fantasy/providers/openaicompat"
)

// FantasyRunner adapts Fantasy to the application's AI SDK UI compatible
// stream protocol. Fantasy types never escape this file.
type FantasyRunner struct{}

func NewFantasyRunner() *FantasyRunner {
	return &FantasyRunner{}
}

func (r *FantasyRunner) Stream(ctx context.Context, request Request, emit EmitFunc) (Result, error) {
	model, err := languageModel(ctx, request.Model)
	if err != nil {
		return Result{}, err
	}

	opts := make([]fantasy.AgentOption, 0, 1)
	if request.SystemPrompt != "" {
		opts = append(opts, fantasy.WithSystemPrompt(request.SystemPrompt))
	}
	fantasyAgent := fantasy.NewAgent(model, opts...)
	messages, err := toFantasyMessages(request.Messages)
	if err != nil {
		return Result{}, err
	}

	emitChunk := func(chunk StreamChunk) error {
		if emit == nil {
			return nil
		}
		return emit(ctx, chunk)
	}

	streamCall := fantasy.AgentStreamCall{
		Messages: messages,
		OnStepStart: func(_ int) error {
			return emitChunk(StreamChunk{Type: "start-step"})
		},
		OnTextStart: func(id string) error {
			return emitChunk(StreamChunk{Type: "text-start", ID: id})
		},
		OnTextDelta: func(id, text string) error {
			return emitChunk(StreamChunk{Type: "text-delta", ID: id, Delta: text})
		},
		OnTextEnd: func(id string) error {
			return emitChunk(StreamChunk{Type: "text-end", ID: id})
		},
		OnReasoningStart: func(id string, reasoning fantasy.ReasoningContent) error {
			if err := emitChunk(StreamChunk{Type: "reasoning-start", ID: id}); err != nil {
				return err
			}
			if reasoning.Text != "" {
				return emitChunk(StreamChunk{Type: "reasoning-delta", ID: id, Delta: reasoning.Text})
			}
			return nil
		},
		OnReasoningDelta: func(id, text string) error {
			return emitChunk(StreamChunk{Type: "reasoning-delta", ID: id, Delta: text})
		},
		OnReasoningEnd: func(id string, _ fantasy.ReasoningContent) error {
			return emitChunk(StreamChunk{Type: "reasoning-end", ID: id})
		},
		OnToolInputStart: func(id, toolName string) error {
			return emitChunk(StreamChunk{Type: "tool-input-start", ToolCallID: id, ToolName: toolName, Dynamic: true})
		},
		OnToolInputDelta: func(id, delta string) error {
			return emitChunk(StreamChunk{Type: "tool-input-delta", ToolCallID: id, InputTextDelta: delta})
		},
		OnToolCall: func(call fantasy.ToolCallContent) error {
			input := decodeJSONValue(call.Input)
			if call.Invalid {
				message := "Invalid tool input"
				if call.ValidationError != nil {
					message = call.ValidationError.Error()
				}
				return emitChunk(StreamChunk{Type: "tool-input-error", ToolCallID: call.ToolCallID, ToolName: call.ToolName, Input: input, ErrorText: message, Dynamic: true, ProviderExecuted: call.ProviderExecuted})
			}
			return emitChunk(StreamChunk{Type: "tool-input-available", ToolCallID: call.ToolCallID, ToolName: call.ToolName, Input: input, Dynamic: true, ProviderExecuted: call.ProviderExecuted})
		},
		OnToolResult: func(result fantasy.ToolResultContent) error {
			chunk := StreamChunk{ToolCallID: result.ToolCallID, Dynamic: true, ProviderExecuted: result.ProviderExecuted}
			switch output := result.Result.(type) {
			case fantasy.ToolResultOutputContentText:
				chunk.Type = "tool-output-available"
				chunk.Output = decodeJSONValue(output.Text)
			case *fantasy.ToolResultOutputContentText:
				chunk.Type = "tool-output-available"
				chunk.Output = decodeJSONValue(output.Text)
			case fantasy.ToolResultOutputContentMedia:
				chunk.Type = "tool-output-available"
				chunk.Output = map[string]any{"data": output.Data, "mediaType": output.MediaType, "text": output.Text}
			case *fantasy.ToolResultOutputContentMedia:
				chunk.Type = "tool-output-available"
				chunk.Output = map[string]any{"data": output.Data, "mediaType": output.MediaType, "text": output.Text}
			case fantasy.ToolResultOutputContentError:
				chunk.Type = "tool-output-error"
				if output.Error != nil {
					chunk.ErrorText = output.Error.Error()
				}
			case *fantasy.ToolResultOutputContentError:
				chunk.Type = "tool-output-error"
				if output.Error != nil {
					chunk.ErrorText = output.Error.Error()
				}
			default:
				chunk.Type = "tool-output-error"
				chunk.ErrorText = "Unsupported tool result"
			}
			if chunk.Type == "tool-output-error" && chunk.ErrorText == "" {
				chunk.ErrorText = "Tool execution failed"
			}
			return emitChunk(chunk)
		},
		OnSource: func(source fantasy.SourceContent) error {
			if source.SourceType == fantasy.SourceTypeDocument {
				title := source.Title
				if title == "" {
					title = source.Filename
				}
				if title == "" {
					title = "Document"
				}
				mediaType := source.MediaType
				if mediaType == "" {
					mediaType = "application/octet-stream"
				}
				return emitChunk(StreamChunk{Type: "source-document", SourceID: source.ID, Title: title, MediaType: mediaType, Filename: source.Filename})
			}
			return emitChunk(StreamChunk{Type: "source-url", SourceID: source.ID, URL: source.URL, Title: source.Title})
		},
		OnStepFinish: func(_ fantasy.StepResult) error {
			return emitChunk(StreamChunk{Type: "finish-step"})
		},
	}

	result, err := fantasyAgent.Stream(ctx, streamCall)
	if err != nil {
		return Result{}, err
	}
	finishReason := ""
	if len(result.Steps) > 0 {
		finishReason = string(result.Steps[len(result.Steps)-1].FinishReason)
	}
	return Result{
		Usage: Usage{
			InputTokens:         result.TotalUsage.InputTokens,
			OutputTokens:        result.TotalUsage.OutputTokens,
			TotalTokens:         result.TotalUsage.TotalTokens,
			ReasoningTokens:     result.TotalUsage.ReasoningTokens,
			CacheCreationTokens: result.TotalUsage.CacheCreationTokens,
			CacheReadTokens:     result.TotalUsage.CacheReadTokens,
		},
		FinishReason: finishReason,
		StepCount:    len(result.Steps),
	}, nil
}

func languageModel(ctx context.Context, config ModelConfig) (fantasy.LanguageModel, error) {
	var provider fantasy.Provider
	var err error
	switch config.Protocol {
	case "openai":
		provider, err = openai.New(openai.WithAPIKey(config.APIKey), openai.WithBaseURL(config.BaseURL))
	case "openai-compatible":
		provider, err = openaicompat.New(openaicompat.WithAPIKey(config.APIKey), openaicompat.WithBaseURL(config.BaseURL))
	case "anthropic":
		provider, err = anthropic.New(anthropic.WithAPIKey(config.APIKey), anthropic.WithBaseURL(config.BaseURL))
	case "google":
		provider, err = google.New(google.WithGeminiAPIKey(config.APIKey), google.WithBaseURL(config.BaseURL))
	default:
		return nil, fmt.Errorf("unsupported model protocol %q", config.Protocol)
	}
	if err != nil {
		return nil, err
	}
	return provider.LanguageModel(ctx, config.ModelID)
}

func toFantasyMessages(messages []Message) ([]fantasy.Message, error) {
	result := make([]fantasy.Message, 0, len(messages)*2)
	for _, message := range messages {
		switch message.Role {
		case "user":
			parts := make([]fantasy.MessagePart, 0, len(message.Parts))
			for _, part := range message.Parts {
				if partType, _ := part["type"].(string); partType == "text" {
					if text, _ := part["text"].(string); text != "" {
						parts = append(parts, fantasy.TextPart{Text: text})
					}
				}
			}
			if len(parts) > 0 {
				result = append(result, fantasy.Message{Role: fantasy.MessageRoleUser, Content: parts})
			}
		case "assistant":
			assistantParts := make([]fantasy.MessagePart, 0, len(message.Parts))
			toolParts := make([]fantasy.MessagePart, 0)
			for _, part := range message.Parts {
				partType, _ := part["type"].(string)
				switch partType {
				case "text":
					if text, _ := part["text"].(string); text != "" {
						assistantParts = append(assistantParts, fantasy.TextPart{Text: text})
					}
				case "reasoning":
					if text, _ := part["text"].(string); text != "" {
						assistantParts = append(assistantParts, fantasy.ReasoningPart{Text: text})
					}
				case "dynamic-tool":
					callID, _ := part["toolCallId"].(string)
					toolName, _ := part["toolName"].(string)
					if callID == "" || toolName == "" {
						continue
					}
					input, err := json.Marshal(part["input"])
					if err != nil {
						return nil, err
					}
					assistantParts = append(assistantParts, fantasy.ToolCallPart{ToolCallID: callID, ToolName: toolName, Input: string(input)})
					if state, _ := part["state"].(string); state == "output-available" {
						output, err := json.Marshal(part["output"])
						if err != nil {
							return nil, err
						}
						toolParts = append(toolParts, fantasy.ToolResultPart{ToolCallID: callID, Output: fantasy.ToolResultOutputContentText{Text: string(output)}})
					} else if state == "output-error" {
						errorText, _ := part["errorText"].(string)
						toolParts = append(toolParts, fantasy.ToolResultPart{ToolCallID: callID, Output: fantasy.ToolResultOutputContentError{Error: errors.New(errorText)}})
					}
				}
			}
			if len(assistantParts) > 0 {
				result = append(result, fantasy.Message{Role: fantasy.MessageRoleAssistant, Content: assistantParts})
			}
			if len(toolParts) > 0 {
				result = append(result, fantasy.Message{Role: fantasy.MessageRoleTool, Content: toolParts})
			}
		}
	}
	return result, nil
}

func decodeJSONValue(value string) any {
	if value == "" {
		return nil
	}
	var decoded any
	if json.Unmarshal([]byte(value), &decoded) == nil {
		return decoded
	}
	return value
}
