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

const (
	maxAgentSteps        = 12
	maxAgentOutputTokens = 16384
)

// effectiveMaxOutputTokens returns the model-specific limit, falling back to
// the package default when the model does not configure one.
func effectiveMaxOutputTokens(config ModelConfig) int64 {
	if config.MaxOutputTokens > 0 {
		return int64(config.MaxOutputTokens)
	}
	return maxAgentOutputTokens
}

// FantasyRunner adapts Fantasy to the application's AI SDK UI compatible
// stream protocol. PocketBase and application-domain services stay outside
// this package and are supplied through an actor-scoped tool factory.
type FantasyToolFactory func(scope ToolScope) []fantasy.AgentTool

type FantasyRunner struct {
	toolFactory FantasyToolFactory
}

func NewFantasyRunner(toolFactory FantasyToolFactory) *FantasyRunner {
	return &FantasyRunner{toolFactory: toolFactory}
}

func GenerateText(ctx context.Context, config ModelConfig, systemPrompt, prompt string) (string, error) {
	model, err := languageModel(ctx, config)
	if err != nil {
		return "", err
	}
	return generateText(ctx, model, effectiveMaxOutputTokens(config), systemPrompt, prompt)
}

// generateText uses the provider's streaming transport even though callers
// receive one completed string. Some providers reject non-streaming requests
// solely because the configured output limit could take a long time, before
// considering that the actual response (for example, a summary) will be much
// shorter.
func generateText(ctx context.Context, model fantasy.LanguageModel, maxOutputTokens int64, systemPrompt, prompt string) (string, error) {
	opts := []fantasy.AgentOption{
		fantasy.WithStopConditions(fantasy.StepCountIs(1)),
		fantasy.WithMaxOutputTokens(maxOutputTokens),
	}
	if systemPrompt != "" {
		opts = append(opts, fantasy.WithSystemPrompt(systemPrompt))
	}
	result, err := fantasy.NewAgent(model, opts...).Stream(ctx, fantasy.AgentStreamCall{Prompt: prompt})
	if err != nil {
		return "", err
	}
	return result.Response.Content.Text(), nil
}

func (r *FantasyRunner) Stream(ctx context.Context, request Request, emit EmitFunc) (Result, error) {
	ctx = withApprovalHandler(ctx, request.Approval)
	model, err := languageModel(ctx, request.Model)
	if err != nil {
		return Result{}, err
	}

	opts := []fantasy.AgentOption{
		fantasy.WithStopConditions(fantasy.StepCountIs(maxAgentSteps)),
		fantasy.WithMaxOutputTokens(effectiveMaxOutputTokens(request.Model)),
	}
	if r.toolFactory != nil {
		opts = append(opts, fantasy.WithTools(r.toolFactory(ToolScope{
			ActorID:        request.ActorID,
			ConversationID: request.ConversationID,
			UserMessageID:  request.UserMessageID,
		})...))
	}
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
			if text == "" {
				return nil
			}
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
			if text == "" {
				return nil
			}
			return emitChunk(StreamChunk{Type: "reasoning-delta", ID: id, Delta: text})
		},
		OnReasoningEnd: func(id string, reasoning fantasy.ReasoningContent) error {
			chunk := StreamChunk{Type: "reasoning-end", ID: id, ProviderMetadata: providerMetadataMap(reasoning.ProviderMetadata)}
			// Preserve provider metadata (e.g. Anthropic thinking-block
			// signatures). Without it, a rebuilt reasoning part cannot be
			// round-tripped back into a thinking block, and providers that
			// require thinking blocks to accompany tool_use blocks (Anthropic)
			// reject the request on the next turn.
			return emitChunk(chunk)
		},
		OnToolInputStart: func(id, toolName string) error {
			return emitChunk(StreamChunk{Type: "tool-input-start", ToolCallID: id, ToolName: toolName, Dynamic: true})
		},
		OnToolInputDelta: func(id, delta string) error {
			if delta == "" {
				return nil
			}
			return emitChunk(StreamChunk{Type: "tool-input-delta", ToolCallID: id, InputTextDelta: delta})
		},
		OnToolCall: func(call fantasy.ToolCallContent) error {
			input := decodeJSONValue(call.Input)
			metadata := providerMetadataMap(call.ProviderMetadata)
			if call.Invalid {
				message := "Invalid tool input"
				if call.ValidationError != nil {
					message = call.ValidationError.Error()
				}
				return emitChunk(StreamChunk{Type: "tool-input-error", ToolCallID: call.ToolCallID, ToolName: call.ToolName, Input: input, ErrorText: message, Dynamic: true, ProviderExecuted: call.ProviderExecuted, ProviderMetadata: metadata})
			}
			return emitChunk(StreamChunk{Type: "tool-input-available", ToolCallID: call.ToolCallID, ToolName: call.ToolName, Input: input, Dynamic: true, ProviderExecuted: call.ProviderExecuted, ProviderMetadata: metadata})
		},
		OnToolResult: func(result fantasy.ToolResultContent) error {
			chunk := StreamChunk{ToolCallID: result.ToolCallID, Dynamic: true, ProviderExecuted: result.ProviderExecuted, ProviderMetadata: providerMetadataMap(result.ProviderMetadata)}
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
	lastStepUsage := Usage{}
	if len(result.Steps) > 0 {
		lastStep := result.Steps[len(result.Steps)-1]
		finishReason = string(lastStep.FinishReason)
		lastStepUsage = toUsage(lastStep.Usage)
	}
	return Result{
		Usage:         toUsage(result.TotalUsage),
		FinishReason:  finishReason,
		StepCount:     len(result.Steps),
		LastStepUsage: lastStepUsage,
	}, nil
}

func toUsage(usage fantasy.Usage) Usage {
	return Usage{
		InputTokens:         usage.InputTokens,
		OutputTokens:        usage.OutputTokens,
		TotalTokens:         usage.TotalTokens,
		ReasoningTokens:     usage.ReasoningTokens,
		CacheCreationTokens: usage.CacheCreationTokens,
		CacheReadTokens:     usage.CacheReadTokens,
	}
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
			// Rebuild assistant messages preserving the Anthropic contract:
			// every tool_use block must be immediately followed (in the next
			// message) by its tool_result. Fantasy splits a multi-step turn
			// into separate assistant/tool messages per step (see
			// toResponseMessages in agent.go). We must reconstruct that
			// structure from the flattened, persisted parts — using the
			// "step-start" markers as step boundaries.
			steps := splitAssistantPartsByStep(message.Parts)
			for _, stepParts := range steps {
				assistantParts := make([]fantasy.MessagePart, 0, len(stepParts))
				var toolParts []fantasy.MessagePart
				for _, part := range stepParts {
					partType, _ := part["type"].(string)
					switch partType {
					case "text":
						if text, _ := part["text"].(string); text != "" {
							assistantParts = append(assistantParts, fantasy.TextPart{Text: text})
						}
					case "reasoning":
						text, _ := part["text"].(string)
						meta, _ := part["providerMetadata"].(map[string]any)
						if text == "" && len(meta) == 0 {
							continue
						}
						reasoningPart := fantasy.ReasoningPart{Text: text}
						if len(meta) > 0 {
							reasoningPart.ProviderOptions = toProviderOptions(meta)
						}
						assistantParts = append(assistantParts, reasoningPart)
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
						providerExecuted, _ := part["providerExecuted"].(bool)
						callPart := fantasy.ToolCallPart{ToolCallID: callID, ToolName: toolName, Input: string(input), ProviderExecuted: providerExecuted}
						if meta, ok := part["callProviderMetadata"].(map[string]any); ok && len(meta) > 0 {
							callPart.ProviderOptions = toProviderOptions(meta)
						}
						assistantParts = append(assistantParts, callPart)
						if state, _ := part["state"].(string); state == "output-available" {
							output, err := toolResultText(part["output"])
							if err != nil {
								return nil, err
							}
							resultPart := fantasy.ToolResultPart{ToolCallID: callID, Output: fantasy.ToolResultOutputContentText{Text: output}, ProviderExecuted: providerExecuted}
							if meta, ok := part["resultProviderMetadata"].(map[string]any); ok && len(meta) > 0 {
								resultPart.ProviderOptions = toProviderOptions(meta)
							}
							if providerExecuted {
								assistantParts = append(assistantParts, resultPart)
							} else {
								toolParts = append(toolParts, resultPart)
							}
						} else if state == "output-error" {
							errorText, _ := part["errorText"].(string)
							resultPart := fantasy.ToolResultPart{ToolCallID: callID, Output: fantasy.ToolResultOutputContentError{Error: errors.New(errorText)}, ProviderExecuted: providerExecuted}
							if meta, ok := part["resultProviderMetadata"].(map[string]any); ok && len(meta) > 0 {
								resultPart.ProviderOptions = toProviderOptions(meta)
							}
							if providerExecuted {
								assistantParts = append(assistantParts, resultPart)
							} else {
								toolParts = append(toolParts, resultPart)
							}
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

func toolResultText(value any) (string, error) {
	if text, ok := value.(string); ok {
		return text, nil
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

func providerMetadataMap(metadata fantasy.ProviderMetadata) map[string]any {
	if len(metadata) == 0 {
		return nil
	}
	raw, err := json.Marshal(metadata)
	if err != nil {
		return nil
	}
	var value map[string]any
	if json.Unmarshal(raw, &value) != nil || len(value) == 0 {
		return nil
	}
	return value
}

// toProviderOptions rebuilds a fantasy.ProviderOptions from a
// map[string]any (as persisted in a Part). Each value is re-marshaled to
// json.RawMessage so the fantasy registry can route it to the correct
// provider-specific type (e.g. Anthropic's ReasoningOptionMetadata carrying
// the thinking-block signature).
func toProviderOptions(meta map[string]any) fantasy.ProviderOptions {
	rawMap := make(map[string]json.RawMessage, len(meta))
	for provider, value := range meta {
		raw, err := json.Marshal(value)
		if err != nil {
			continue
		}
		rawMap[provider] = raw
	}
	opts, err := fantasy.UnmarshalProviderOptions(rawMap)
	if err != nil {
		return nil
	}
	return opts
}

// splitAssistantPartsByStep groups persisted assistant parts into per-step
// slices, using "step-start" markers as boundaries. This mirrors how the
// fantasy agent splits a multi-step turn into separate messages internally
// (one assistant + tool message pair per step). Without this split, a
// flattened message with tool_use followed by second-step text would place
// content between a tool_use and its tool_result, violating the Anthropic
// API contract. If no step-start markers are present (e.g. older records),
// all parts are returned as a single group.
func splitAssistantPartsByStep(parts []Part) [][]Part {
	var groups [][]Part
	current := make([]Part, 0)
	for _, part := range parts {
		if partType, _ := part["type"].(string); partType == "step-start" {
			if len(current) > 0 {
				groups = append(groups, current)
			}
			current = make([]Part, 0)
			continue
		}
		current = append(current, part)
	}
	if len(current) > 0 {
		groups = append(groups, current)
	}
	if len(groups) == 0 && len(parts) > 0 {
		groups = [][]Part{parts}
	}
	return groups
}
