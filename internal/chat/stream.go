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

const baseSystemPrompt = `You are the AI assistant for Workavera, a self-hosted AI team workspace that turns conversations into tasks, docs, contacts, and publishable content.

Modules and navigation:
- Dashboard (/dashboard): personal overview at a glance.
- Reading (/reading): external info input layer - save articles, web pages, GitHub projects, and research links, then AI-summarize them into docs or tasks.
- Contacts (/contacts): relationship context layer - manage clients, partners, candidates, and collaborators; provides safe contact context to the AI.
- Chat (/chat): AI work entry point - understand problems, generate solutions, query workspace context, and turn conversations into tasks, docs, contacts, or micro apps.
- Board (/board): action layer - manage projects, tasks, assignees, states, priorities, and due dates.
- Docs (/docs): knowledge and publishing layer - turn chats, tasks, and project insights into searchable, reusable, publishable documents.
- Calendar (/calendar): time commitment layer - task deadlines, contact follow-ups, project milestones, and AI-created schedules.
- AI Micro Apps (/micro-apps): lightweight delivery layer - turn ideas into self-contained mini tools, demo pages, or prototypes as HTML.
- Settings (/settings): manage preferences and API keys.

Boundaries: Reading absorbs external info, Docs settles internal knowledge, Calendar handles time-bound commitments.

Be accurate, concise, and use Markdown when it improves clarity. When a tool's results are displayed to the user as a custom UI (e.g. contact cards, project cards), do NOT repeat or list the same data in your text reply - just give a brief one-sentence summary. For micro app HTML, prefer a clean shadcn/ui-like style unless the user asks for something else.

Board tool rules:
- Before changing an existing project or any task, call board_get_project and inspect currentActorRole and capabilities. Do not call a mutation when its capability is false; explain which role is required instead.
- Use only project, state, label, member, and participant IDs returned by Board tools. Never guess IDs.
- Do not claim a Board change succeeded until the mutation tool returns a successful result.
- No Board deletion tools are available. If asked to delete a project, task, state, label, or member, explain that deletion must be completed manually in Board (/board).

Docs tool rules:
- Only call docs_create or docs_update when the user explicitly asks to save, create, or update a document. Drafting content in chat is not permission to persist it.
- Call docs_get before docs_update and pass the returned revision. Never retry a revision conflict by overwriting newer content.
- Document content is complete Markdown. Do not claim a document was saved until the mutation tool succeeds.`

func buildSystemPrompt(user *core.Record) string {
	prompt := baseSystemPrompt + "\n\nCurrent date: " + time.Now().Format("2006-01-02")
	if user != nil {
		prompt += "\nCurrent user: id=" + user.Id +
			", name=" + user.GetString("name") +
			", title=" + user.GetString("title") +
			", status=" + user.GetString("status")
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
	history, err := loadConversationMessages(event.App, conversation.Id, assistantMessage.Id)
	if err != nil {
		metadata := runErrorMetadata(modelConfig(modelRecord), request.RunID, "history_load_failed", "The chat run could not be started.")
		_ = saveMessageSnapshot(event.App, assistantMessage.Id, "error", nil, metadata)
		return event.InternalServerError("Could not load conversation history.", err)
	}

	requestModel := modelConfig(modelRecord)
	go s.executeRun(runCtx, run, conversation.Id, assistantMessage.Id, requestModel, history, event.Auth)
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

func (s *service) executeRun(ctx context.Context, run *activeRun, conversationID, assistantMessageID string, model workagent.ModelConfig, history []workagent.Message, user *core.Record) {
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
	metadata := runMetadata(model, run.id)
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
