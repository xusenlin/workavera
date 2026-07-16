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

const baseSystemPrompt = `You are the AI assistant for Workavera. Workavera is a free, open-source, self-hosted, AI-powered workspace.

Modules and navigation:
- Dashboard (/dashboard): personal overview.
- Reading (/reading): capture and summarize external sources.
- Contacts (/contacts): manage relationship context.
- Chat (/chat): AI workspace entry point.
- Board (/board): manage projects and tasks.
- Docs (/docs): create, organize, and publish knowledge, including interactive HTML documents (self-contained tools and prototypes).
- Calendar (/calendar): manage events and time commitments.
- Settings (/settings): manage preferences, models, and API keys.

Module boundaries: Reading captures external information; Docs stores reusable knowledge and interactive HTML artifacts; Board tracks actionable work; Calendar tracks time commitments.

The app uses a shadcn/ui neutral style. Unless the user asks for a different style, HTML documents you create should match it, honoring the user's appearance preference below.

Be accurate, concise, and use Markdown only when helpful. Tool results are rendered in custom UI: do not repeat or list returned data; respond with one brief outcome sentence and only add warnings, errors, or next steps not shown in the UI.

Only mutate workspace data when the user explicitly asks. Follow tool descriptions for prerequisites, permissions, IDs, and concurrency. Never guess IDs or claim success before the mutation tool succeeds.`

func buildSystemPrompt(user *core.Record) string {
	prompt := baseSystemPrompt + "\n\nCurrent date: " + time.Now().Format("2006-01-02")
	if user != nil {
		theme := user.GetString("theme")
		if theme == "" {
			theme = "system"
		}
		prompt += "\nCurrent user: id=" + user.Id +
			", name=" + user.GetString("name") +
			", title=" + user.GetString("title") +
			", status=" + user.GetString("status") +
			", appearance=" + theme
	}
	return prompt
}

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

	runCtx, cancel := context.WithTimeout(context.Background(), maxRunDuration)
	run := newActiveRun(request.RunID, event.Auth.Id, conversation.Id, cancel)
	if !s.registerRun(run) {
		cancel()
		return event.Error(http.StatusConflict, "This conversation already has an active chat run.", nil)
	}
	cleanupRun := true
	defer func() {
		if cleanupRun {
			cancel()
			run.finish()
			s.removeRun(run)
		}
	}()

	_, assistantMessage, err := createTurnRecords(event.App, conversation, modelRecord, request.RunID, request.Message.Parts)
	if err != nil {
		return event.BadRequestError("Could not create chat messages.", err)
	}

	requestModel := modelConfig(modelRecord)
	go s.executeRun(runCtx, run, conversation, assistantMessage.Id, requestModel, event.Auth)
	cleanupRun = false

	return streamRun(event, run)
}

func (s *service) resumeRun(event *core.RequestEvent) error {
	run := s.findRun(event.Request.PathValue("id"), event.Auth.Id)
	if run == nil {
		return event.NoContent(http.StatusNoContent)
	}
	return streamRun(event, run)
}

func streamRun(event *core.RequestEvent, run *activeRun) error {
	prepareSSE(event, run.id)
	index := 0
	for {
		chunks, done, notify := run.readFrom(index)
		for _, chunk := range chunks {
			if err := writeSSE(event, chunk); err != nil {
				return nil
			}
			index++
		}
		if done {
			_ = writeSSEDone(event)
			return nil
		}
		select {
		case <-notify:
		case <-event.Request.Context().Done():
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

func (s *service) executeRun(ctx context.Context, run *activeRun, conversation *core.Record, assistantMessageID string, model workagent.ModelConfig, user *core.Record) {
	conversationID := conversation.Id
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
			metadata := runErrorMetadata(model, run.id, "internal_error", "The chat run failed unexpectedly.")
			run.publish(workagent.StreamChunk{Type: "error", ErrorText: "The chat run failed unexpectedly."})
			if err := saveMessageSnapshot(s.app, assistantMessageID, "error", reducer.Snapshot().Parts, metadata); err != nil {
				s.app.Logger().Error("failed to persist panicked chat run", "runId", run.id, "error", err)
			}
		}
		run.cancel()
		run.finish()
		s.removeRun(run)
	}()

	run.publish(workagent.StreamChunk{Type: "start", MessageID: assistantMessageID, MessageMetadata: map[string]any{"runId": run.id}})

	// Compact synchronously before assembling history: the active-run guard
	// already blocks concurrent sends for this conversation, and the emitted
	// data part tells the user why the response is taking longer. A failed
	// compaction degrades to running with the uncompacted history.
	if needsCompaction(conversation, model) {
		if plan, err := planCompaction(s.app, conversation, assistantMessageID); err != nil {
			s.app.Logger().Error("context compaction planning failed", "runId", run.id, "conversationId", conversationID, "error", err)
		} else if plan != nil {
			s.publishAndPersist(run, reducer, compactionChunk(map[string]any{"state": "started"}))
			if compacted, err := executeCompaction(ctx, s.app, model, conversationID, plan); err != nil {
				s.app.Logger().Error("context compaction failed", "runId", run.id, "conversationId", conversationID, "error", err)
				s.publishAndPersist(run, reducer, compactionChunk(map[string]any{"state": "failed"}))
			} else {
				conversation = compacted
				s.publishAndPersist(run, reducer, compactionChunk(map[string]any{"state": "done", "untilSequence": plan.boundary}))
			}
		}
	}

	history, err := loadConversationMessages(s.app, conversation, assistantMessageID)
	if err != nil {
		s.app.Logger().Error("chat history load failed", "runId", run.id, "conversationId", conversationID, "error", err)
		metadata := runErrorMetadata(model, run.id, "history_load_failed", "The conversation history could not be loaded.")
		run.publish(workagent.StreamChunk{Type: "error", ErrorText: "The conversation history could not be loaded."})
		_ = saveMessageSnapshot(s.app, assistantMessageID, "error", reducer.Snapshot().Parts, metadata)
		return
	}

	lastCheckpoint := time.Now()
	result, err := s.runner.Stream(ctx, workagent.Request{
		SystemPrompt: buildSystemPrompt(user),
		Messages:     history,
		Model:        model,
		ActorID:      user.Id,
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
		metadata := runMetadata(model, run.id)
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
			metadata = runErrorMetadata(model, run.id, code, message)
			run.publish(workagent.StreamChunk{Type: "error", ErrorText: message})
		}
		_ = saveMessageSnapshot(s.app, assistantMessageID, status, reducer.Snapshot().Parts, metadata)
		return
	}

	result.FinishReason = normalizeFinishReason(result.FinishReason)
	parts := reducer.Snapshot().Parts
	contextTokens := workagent.ContextSize(model.Protocol, result.LastStepUsage)
	metadata := runMetadata(model, run.id)
	// Some providers never report input usage (e.g. GLM's Anthropic-compatible
	// endpoint always sends input_tokens = 0). A zero input side would render
	// a tiny context ring and, worse, never trigger compaction — fall back to
	// a character-based estimate of what was actually sent and produced.
	if result.LastStepUsage.InputTokens+result.LastStepUsage.CacheCreationTokens+result.LastStepUsage.CacheReadTokens == 0 {
		contextTokens = estimateContextTokens(history, parts)
		metadata["contextTokensEstimated"] = true
	}
	metadata["usage"] = result.Usage
	// The final step's usage describes what currently occupies the context
	// window (the ring and its hover breakdown), while "usage" above sums
	// every step for cost reporting.
	metadata["contextUsage"] = result.LastStepUsage
	metadata["contextTokens"] = contextTokens
	metadata["finishReason"] = result.FinishReason
	metadata["stepCount"] = result.StepCount
	run.publish(workagent.StreamChunk{Type: "message-metadata", MessageMetadata: metadata})
	run.publish(workagent.StreamChunk{Type: "finish", FinishReason: result.FinishReason, MessageMetadata: metadata})
	if err := saveMessageSnapshot(s.app, assistantMessageID, "complete", parts, metadata); err == nil {
		_ = updateConversationStats(s.app, conversationID, parts, result.Usage, contextTokens)
	}
}

// publishAndPersist applies a chunk to the reducer, streams it, and
// checkpoints the message snapshot so out-of-band parts (like compaction
// markers) survive a reconnect or server restart.
func (s *service) publishAndPersist(run *activeRun, reducer *messageReducer, chunk workagent.StreamChunk) {
	reducer.Apply(chunk)
	run.publish(chunk)
	snapshot := reducer.Snapshot()
	_ = saveMessageSnapshot(s.app, snapshot.ID, "streaming", snapshot.Parts, nil)
}

// compactionChunk builds a "data-compaction" stream part. The fixed part id
// makes the AI SDK client replace the part in place as the state advances.
func compactionChunk(data map[string]any) workagent.StreamChunk {
	return workagent.StreamChunk{Type: "data-compaction", ID: "compaction", Data: data}
}

func runErrorMetadata(model workagent.ModelConfig, runID, code, message string) map[string]any {
	metadata := runMetadata(model, runID)
	metadata["finishReason"] = "error"
	metadata["error"] = map[string]any{"code": code, "message": message}
	return metadata
}

func createTurnRecords(app core.App, conversation, model *core.Record, runID string, userParts []workagent.Part) (*core.Record, *core.Record, error) {
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
		assistant.Set("metadata", runMetadata(modelConfig(model), runID))
		if err := tx.Save(assistant); err != nil {
			return err
		}

		storedConversation, err := tx.FindRecordById(conversationsCollection, conversation.Id)
		if err != nil {
			return err
		}
		storedConversation.Set("message_count+", 2)
		storedConversation.Set("last_message_at", types.NowDateTime())
		storedConversation.Set("model_config", model.Id)
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

func updateConversationStats(app core.App, conversationID string, parts []workagent.Part, usage workagent.Usage, contextTokens int64) error {
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
	// Snapshot (not accumulate): the latest run's context-window occupancy,
	// compared against the compaction threshold on the next run.
	record.Set("context_tokens", contextTokens)
	return app.Save(record)
}

func baseMetadata(model workagent.ModelConfig) map[string]any {
	return map[string]any{"model": map[string]any{"configId": model.ID, "modelId": model.ModelID, "name": model.Name, "protocol": model.Protocol}}
}

func runMetadata(model workagent.ModelConfig, runID string) map[string]any {
	metadata := baseMetadata(model)
	metadata["runId"] = runID
	return metadata
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
