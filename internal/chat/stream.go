package chat

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
	workagent "github.com/xusenlin/workavera/internal/agent"
)

const defaultSystemPrompt = "You are a helpful assistant for a collaborative work management application. Be accurate, concise, and use Markdown when it improves clarity."

type streamRequest struct {
	RunID          string            `json:"runId"`
	ConversationID string            `json:"conversationId"`
	ModelConfigID  string            `json:"modelConfigId"`
	Message        workagent.Message `json:"message"`
}

func (s *service) stream(event *core.RequestEvent) error {
	var request streamRequest
	if err := event.BindBody(&request); err != nil {
		return event.BadRequestError("Invalid chat request.", err)
	}
	request.ConversationID = strings.TrimSpace(request.ConversationID)
	request.ModelConfigID = strings.TrimSpace(request.ModelConfigID)
	request.RunID = strings.TrimSpace(request.RunID)
	if request.RunID == "" {
		request.RunID = uuid.NewString()
	}
	if request.ModelConfigID == "" {
		return event.BadRequestError("A model configuration is required.", nil)
	}
	conversation, err := findOwnedConversation(event.App, request.ConversationID, event.Auth.Id)
	if err != nil {
		return event.NotFoundError("Conversation not found.", err)
	}
	modelRecord, err := findOwnedModel(event.App, request.ModelConfigID, event.Auth.Id)
	if err != nil {
		return event.NotFoundError("Model configuration not found.", err)
	}
	if request.Message.Role != "user" || !validUserParts(request.Message.Parts) {
		return event.BadRequestError("A non-empty user text message is required.", nil)
	}

	_, assistantMessage, err := createTurnRecords(event.App, conversation, modelRecord, request.Message.Parts)
	if err != nil {
		return event.BadRequestError("Could not create chat messages.", err)
	}
	history, err := loadConversationMessages(event.App, conversation.Id, assistantMessage.Id)
	if err != nil {
		return event.InternalServerError("Could not load conversation history.", err)
	}

	runCtx, cancel := context.WithTimeout(context.Background(), maxRunDuration)
	run := newActiveRun(request.RunID, event.Auth.Id, cancel)
	s.registerRun(run)
	subscriber := run.subscribe()

	requestModel := modelConfig(modelRecord)
	go s.executeRun(runCtx, run, conversation.Id, assistantMessage.Id, requestModel, history, event.Auth.Id)

	prepareSSE(event, run.id)
	for {
		select {
		case chunk, ok := <-subscriber:
			if !ok {
				_ = writeSSEDone(event)
				return nil
			}
			if err := writeSSE(event, chunk); err != nil {
				run.unsubscribe(subscriber)
				return nil
			}
		case <-event.Request.Context().Done():
			run.unsubscribe(subscriber)
			return nil
		}
	}
}

func (s *service) stopRun(event *core.RequestEvent) error {
	if !s.cancelRun(event.Request.PathValue("id"), event.Auth.Id) {
		return event.NotFoundError("Active chat run not found.", nil)
	}
	return event.NoContent(http.StatusAccepted)
}

func (s *service) executeRun(ctx context.Context, run *activeRun, conversationID, assistantMessageID string, model workagent.ModelConfig, history []workagent.Message, ownerID string) {
	reducer := newMessageReducer(assistantMessageID)
	defer func() {
		if r := recover(); r != nil {
			s.app.Logger().Error(
				"chat run panicked",
				"runId", run.id,
				"conversationId", conversationID,
				"error", fmt.Sprint(r),
				"stack", string(debug.Stack()),
			)
			metadata := runErrorMetadata(model, "internal_error", "The chat run failed unexpectedly.")
			run.publish(workagent.StreamChunk{Type: "error", ErrorText: "The chat run failed unexpectedly."})
			if err := saveMessageSnapshot(s.app, assistantMessageID, "error", reducer.Snapshot().Parts, metadata); err != nil {
				s.app.Logger().Error("failed to persist panicked chat run", "runId", run.id, "error", err)
			}
		}
		run.cancel()
		run.finish()
		s.removeRun(run.id)
	}()

	run.publish(workagent.StreamChunk{Type: "start", MessageID: assistantMessageID, MessageMetadata: map[string]any{"runId": run.id}})
	lastCheckpoint := time.Now()
	result, err := s.runner.Stream(ctx, workagent.Request{
		SystemPrompt: defaultSystemPrompt,
		Messages:     history,
		Model:        model,
		ActorID:      ownerID,
	}, func(_ context.Context, chunk workagent.StreamChunk) error {
		reducer.Apply(chunk)
		run.publish(chunk)
		if shouldCheckpoint(chunk) || time.Since(lastCheckpoint) >= time.Second {
			lastCheckpoint = time.Now()
			return saveMessageSnapshot(s.app, assistantMessageID, "streaming", reducer.Snapshot().Parts, nil)
		}
		return nil
	})

	if err != nil {
		s.app.Logger().Error("chat run failed", "runId", run.id, "conversationId", conversationID, "error", err)
		status := "error"
		metadata := baseMetadata(model)
		if errors.Is(ctx.Err(), context.Canceled) {
			status = "cancelled"
			metadata["finishReason"] = "other"
			run.publish(workagent.StreamChunk{Type: "abort", Reason: "Generation stopped"})
		} else {
			code := "model_request_failed"
			message := "The model request failed."
			if errors.Is(ctx.Err(), context.DeadlineExceeded) {
				code = "run_timeout"
				message = "The model request timed out."
			}
			metadata = runErrorMetadata(model, code, message)
			run.publish(workagent.StreamChunk{Type: "error", ErrorText: message})
		}
		_ = saveMessageSnapshot(s.app, assistantMessageID, status, reducer.Snapshot().Parts, metadata)
		return
	}

	result.FinishReason = normalizeFinishReason(result.FinishReason)
	metadata := baseMetadata(model)
	metadata["usage"] = result.Usage
	metadata["finishReason"] = result.FinishReason
	metadata["stepCount"] = result.StepCount
	run.publish(workagent.StreamChunk{Type: "message-metadata", MessageMetadata: metadata})
	run.publish(workagent.StreamChunk{Type: "finish", FinishReason: result.FinishReason, MessageMetadata: metadata})
	parts := reducer.Snapshot().Parts
	if err := saveMessageSnapshot(s.app, assistantMessageID, "complete", parts, metadata); err == nil {
		_ = updateConversationStats(s.app, conversationID, parts, result.Usage)
	}
}

func runErrorMetadata(model workagent.ModelConfig, code, message string) map[string]any {
	metadata := baseMetadata(model)
	metadata["finishReason"] = "error"
	metadata["error"] = map[string]any{"code": code, "message": message}
	return metadata
}

func createTurnRecords(app core.App, conversation, model *core.Record, userParts []workagent.Part) (*core.Record, *core.Record, error) {
	var userID, assistantID string
	err := app.RunInTransaction(func(tx core.App) error {
		collection, err := tx.FindCollectionByNameOrId(messagesCollection)
		if err != nil {
			return err
		}
		last, err := tx.FindRecordsByFilter(messagesCollection, "conversation = {:conversation}", "-sequence", 1, 0, dbx.Params{"conversation": conversation.Id})
		if err != nil {
			return err
		}
		nextSequence := 0
		if len(last) > 0 {
			nextSequence = last[0].GetInt("sequence") + 1
		}

		user := core.NewRecord(collection)
		user.Set("conversation", conversation.Id)
		user.Set("sequence", nextSequence)
		user.Set("role", "user")
		user.Set("status", "complete")
		user.Set("parts", userParts)
		user.Set("metadata", map[string]any{})
		if err := tx.Save(user); err != nil {
			return err
		}

		assistant := core.NewRecord(collection)
		assistant.Set("conversation", conversation.Id)
		assistant.Set("parent_message", user.Id)
		assistant.Set("sequence", nextSequence+1)
		assistant.Set("role", "assistant")
		assistant.Set("status", "streaming")
		assistant.Set("model_config", model.Id)
		assistant.Set("parts", []workagent.Part{})
		assistant.Set("metadata", baseMetadata(modelConfig(model)))
		if err := tx.Save(assistant); err != nil {
			return err
		}

		storedConversation, err := tx.FindRecordById(conversationsCollection, conversation.Id)
		if err != nil {
			return err
		}
		storedConversation.Set("message_count+", 2)
		storedConversation.Set("last_message_at", types.NowDateTime())
		if err := tx.Save(storedConversation); err != nil {
			return err
		}
		userID, assistantID = user.Id, assistant.Id
		return nil
	})
	if err != nil {
		return nil, nil, err
	}
	user, err := app.FindRecordById(messagesCollection, userID)
	if err != nil {
		return nil, nil, err
	}
	assistant, err := app.FindRecordById(messagesCollection, assistantID)
	return user, assistant, err
}

func updateConversationStats(app core.App, conversationID string, parts []workagent.Part, usage workagent.Usage) error {
	record, err := app.FindRecordById(conversationsCollection, conversationID)
	if err != nil {
		return err
	}
	toolCalls := 0
	for _, part := range parts {
		if part["type"] == "dynamic-tool" {
			toolCalls++
		}
	}
	record.Set("tool_call_count+", toolCalls)
	record.Set("input_tokens+", usage.InputTokens)
	record.Set("output_tokens+", usage.OutputTokens)
	record.Set("total_tokens+", usage.TotalTokens)
	return app.Save(record)
}

func baseMetadata(model workagent.ModelConfig) map[string]any {
	return map[string]any{"model": map[string]any{"configId": model.ID, "modelId": model.ModelID, "name": model.Name, "protocol": model.Protocol}}
}

func validUserParts(parts []workagent.Part) bool {
	for _, part := range parts {
		if part["type"] == "text" {
			if text, _ := part["text"].(string); strings.TrimSpace(text) != "" {
				return true
			}
		}
	}
	return false
}

func normalizeFinishReason(reason string) string {
	switch reason {
	case "stop", "length", "content-filter", "tool-calls", "error", "other":
		return reason
	default:
		return "other"
	}
}
