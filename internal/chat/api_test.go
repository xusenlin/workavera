package chat

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	workagent "github.com/xusenlin/workavera/internal/agent"
	workmemory "github.com/xusenlin/workavera/internal/memory"
	"github.com/xusenlin/workavera/internal/preferences"
	_ "github.com/xusenlin/workavera/migrations"
)

type fakeRunner struct{}

func (fakeRunner) Stream(ctx context.Context, _ workagent.Request, emit workagent.EmitFunc) (workagent.Result, error) {
	for _, chunk := range []workagent.StreamChunk{
		{Type: "start-step"},
		{Type: "text-start", ID: "text-1"},
		{Type: "text-delta", ID: "text-1", Delta: "Hello from the agent"},
		{Type: "text-end", ID: "text-1"},
		{Type: "finish-step"},
	} {
		if err := emit(ctx, chunk); err != nil {
			return workagent.Result{}, err
		}
	}
	return workagent.Result{Usage: workagent.Usage{InputTokens: 3, OutputTokens: 4, TotalTokens: 7}, FinishReason: "stop", StepCount: 1}, nil
}

type panicRunner struct{}

func (panicRunner) Stream(context.Context, workagent.Request, workagent.EmitFunc) (workagent.Result, error) {
	panic("simulated panic")
}

type errorRunner struct{}

func (errorRunner) Stream(context.Context, workagent.Request, workagent.EmitFunc) (workagent.Result, error) {
	return workagent.Result{}, errors.New("provider-secret-diagnostic")
}

type blockingRunner struct {
	started chan struct{}
	release chan struct{}
}

type approvalRunner struct {
	started chan struct{}
}

func (runner *approvalRunner) Stream(ctx context.Context, request workagent.Request, emit workagent.EmitFunc) (workagent.Result, error) {
	if err := emit(ctx, workagent.StreamChunk{Type: "start-step"}); err != nil {
		return workagent.Result{}, err
	}
	if err := emit(ctx, workagent.StreamChunk{Type: "tool-input-available", ToolCallID: "call-1", ToolName: "sensitive_action", Input: map[string]any{"targetId": "target-1"}, Dynamic: true}); err != nil {
		return workagent.Result{}, err
	}
	close(runner.started)
	approved, err := request.Approval(ctx, workagent.ApprovalRequest{
		ToolCallID: "call-1",
		ToolName:   "sensitive_action",
		Title:      "Delete task?",
		Summary:    "Delete Test task.",
		Target:     map[string]any{"id": "task-1", "name": "Test task"},
		Details:    []workagent.ApprovalDetail{{Label: "Project", Value: "Test project"}},
		Presentation: workagent.ApprovalPresentation{
			ConfirmLabel:   "Delete",
			ConfirmVariant: "destructive",
			PendingMessage: "Deleting task…",
		},
	})
	if err != nil {
		return workagent.Result{}, err
	}
	if err := emit(ctx, workagent.StreamChunk{Type: "tool-output-available", ToolCallID: "call-1", Output: map[string]any{"ok": approved}, Dynamic: true}); err != nil {
		return workagent.Result{}, err
	}
	if err := emit(ctx, workagent.StreamChunk{Type: "finish-step"}); err != nil {
		return workagent.Result{}, err
	}
	return workagent.Result{FinishReason: "stop", StepCount: 1}, nil
}

func (runner *blockingRunner) Stream(ctx context.Context, _ workagent.Request, emit workagent.EmitFunc) (workagent.Result, error) {
	for _, chunk := range []workagent.StreamChunk{
		{Type: "start-step"},
		{Type: "text-start", ID: "text-1"},
		{Type: "text-delta", ID: "text-1", Delta: "before reconnect"},
	} {
		if err := emit(ctx, chunk); err != nil {
			return workagent.Result{}, err
		}
	}
	close(runner.started)
	select {
	case <-runner.release:
	case <-ctx.Done():
		return workagent.Result{}, ctx.Err()
	}
	for _, chunk := range []workagent.StreamChunk{
		{Type: "text-delta", ID: "text-1", Delta: " after reconnect"},
		{Type: "text-end", ID: "text-1"},
		{Type: "finish-step"},
	} {
		if err := emit(ctx, chunk); err != nil {
			return workagent.Result{}, err
		}
	}
	return workagent.Result{FinishReason: "stop", StepCount: 1}, nil
}

type chatTestServer struct {
	app     *tests.TestApp
	service *service
	handler http.Handler
	token   string
	ownerID string
	modelID string
}

type signalingRecorder struct {
	*httptest.ResponseRecorder
	wrote chan struct{}
}

func (recorder *signalingRecorder) Write(data []byte) (int, error) {
	select {
	case recorder.wrote <- struct{}{}:
	default:
	}
	return recorder.ResponseRecorder.Write(data)
}

func newChatTestServer(t *testing.T) *chatTestServer {
	return newChatTestServerWithRunner(t, fakeRunner{})
}

func newChatTestServerWithRunner(t *testing.T, runner workagent.Runner) *chatTestServer {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	user := core.NewRecord(users)
	user.SetEmail("chat-owner@example.com")
	user.SetPassword("password123")
	user.Set("name", "Chat Owner")
	user.SetVerified(true)
	if err := app.Save(user); err != nil {
		t.Fatal(err)
	}
	token, err := user.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}

	models, err := app.FindCollectionByNameOrId(modelsCollection)
	if err != nil {
		t.Fatal(err)
	}
	model := core.NewRecord(models)
	model.Set("owner", user.Id)
	model.Set("name", "Test model")
	model.Set("model_id", "test-model")
	model.Set("base_url", "https://example.com/v1")
	model.Set("api_key", "must-not-leak")
	model.Set("protocol", "openai-compatible")
	model.Set("is_default", true)
	if err := app.Save(model); err != nil {
		t.Fatal(err)
	}

	service := newService(app, runner)
	register(app, service)
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	serveEvent := &core.ServeEvent{App: app, Router: router}
	if err := app.OnServe().Trigger(serveEvent, func(event *core.ServeEvent) error { return event.Next() }); err != nil {
		t.Fatal(err)
	}
	handler, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	return &chatTestServer{app: app, service: service, handler: handler, token: token, ownerID: user.Id, modelID: model.Id}
}

// createConversation creates a conversation via the PocketBase built-in Records API.
// The OnRecordCreateRequest hook injects owner, status, and a default title.
func (server *chatTestServer) createConversation(t *testing.T) string {
	t.Helper()
	created := server.request(t, http.MethodPost, "/api/collections/chat_conversations/records", `{"title":"Test"}`)
	if created.Code != http.StatusOK {
		t.Fatalf("create conversation: %d %s", created.Code, created.Body.String())
	}
	var record map[string]any
	if err := json.Unmarshal(created.Body.Bytes(), &record); err != nil {
		t.Fatal(err)
	}
	return record["id"].(string)
}

func (server *chatTestServer) streamMessage(t *testing.T, conversationID string) *httptest.ResponseRecorder {
	t.Helper()
	return server.request(t, http.MethodPost, "/api/chat/stream", `{
		"runId":"00000000-0000-4000-8000-000000000001",
		"conversationId":"`+conversationID+`",
		"modelConfigId":"`+server.modelID+`",
		"message":{"id":"client-1","role":"user","parts":[{"type":"text","text":"Hello"}]}
	}`)
}

func (server *chatTestServer) request(t *testing.T, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("content-type", "application/json")
	request.Header.Set("Authorization", server.token)
	server.handler.ServeHTTP(recorder, request)
	return recorder
}

func TestChatStreamPersistsUIMessageAndUsesProtocol(t *testing.T) {
	server := newChatTestServer(t)
	conversationID := server.createConversation(t)
	stream := server.streamMessage(t, conversationID)
	if stream.Code != http.StatusOK {
		t.Fatalf("stream: %d %s", stream.Code, stream.Body.String())
	}
	if stream.Header().Get("X-Vercel-Ai-Ui-Message-Stream") != "v1" {
		t.Fatalf("missing UI message stream header: %#v", stream.Header())
	}
	body := stream.Body.String()
	for _, expected := range []string{`"type":"start"`, `"type":"text-delta"`, `"type":"finish"`, "data: [DONE]"} {
		if !strings.Contains(body, expected) {
			t.Fatalf("stream missing %s: %s", expected, body)
		}
	}
	if strings.Contains(body, "must-not-leak") {
		t.Fatalf("stream leaked API key: %s", body)
	}

	messages := server.request(t, http.MethodGet, "/api/chat/conversations/"+conversationID+"/messages", "")
	if messages.Code != http.StatusOK {
		t.Fatalf("list messages: %d %s", messages.Code, messages.Body.String())
	}
	var result []workagent.Message
	if err := json.Unmarshal(messages.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result) != 2 || result[1].Parts[len(result[1].Parts)-1]["text"] != "Hello from the agent" {
		t.Fatalf("unexpected messages: %#v", result)
	}
	if result[1].Metadata["runId"] != "00000000-0000-4000-8000-000000000001" {
		t.Fatalf("run id was not persisted: %#v", result[1].Metadata)
	}
}

func TestMemoryUndoEndpointRevertsMemoryAndPersistsToolState(t *testing.T) {
	server := newChatTestServer(t)
	conversationID := server.createConversation(t)
	preference, err := preferences.Ensure(server.app, server.ownerID)
	if err != nil {
		t.Fatal(err)
	}
	preferenceRecord, err := server.app.FindRecordById(preferences.CollectionName, preference.ID)
	if err != nil {
		t.Fatal(err)
	}
	preferenceRecord.Set("memory_enabled", true)
	if err := server.app.Save(preferenceRecord); err != nil {
		t.Fatal(err)
	}

	messages, err := server.app.FindCollectionByNameOrId(messagesCollection)
	if err != nil {
		t.Fatal(err)
	}
	userMessage := core.NewRecord(messages)
	userMessage.Set("conversation", conversationID)
	userMessage.Set("sequence", 0)
	userMessage.Set("role", "user")
	userMessage.Set("status", "complete")
	userMessage.Set("model_config", server.modelID)
	userMessage.Set("parts", []workagent.Part{{"type": "text", "text": "Remember that I prefer concise replies."}})
	if err := server.app.Save(userMessage); err != nil {
		t.Fatal(err)
	}
	result, err := workmemory.Upsert(server.app, server.ownerID, conversationID, userMessage.Id, workmemory.UpsertInput{
		Category: "preference",
		Content:  "The user prefers concise replies.",
		Origin:   "explicit",
	})
	if err != nil {
		t.Fatal(err)
	}
	assistantMessage := core.NewRecord(messages)
	assistantMessage.Set("conversation", conversationID)
	assistantMessage.Set("sequence", 1)
	assistantMessage.Set("role", "assistant")
	assistantMessage.Set("status", "complete")
	assistantMessage.Set("model_config", server.modelID)
	assistantMessage.Set("parts", []workagent.Part{{
		"type":       "dynamic-tool",
		"toolCallId": "memory-call-1",
		"toolName":   "system_memory_upsert",
		"state":      "output-available",
		"input":      map[string]any{"category": "preference", "content": result.Memory.Content, "origin": "explicit"},
		"output":     result,
	}})
	if err := server.app.Save(assistantMessage); err != nil {
		t.Fatal(err)
	}

	response := server.request(t, http.MethodPost, "/api/chat/messages/"+assistantMessage.Id+"/memory-actions/memory-call-1/undo", "")
	if response.Code != http.StatusOK {
		t.Fatalf("undo memory: %d %s", response.Code, response.Body.String())
	}
	var undone workmemory.UpsertResult
	if err := json.Unmarshal(response.Body.Bytes(), &undone); err != nil {
		t.Fatal(err)
	}
	if undone.Action != "undone" || undone.OriginalAction != "created" || undone.UndoneAt == "" {
		t.Fatalf("unexpected undo response: %#v", undone)
	}
	if _, err := server.app.FindRecordById(workmemory.CollectionName, result.Memory.ID); err == nil {
		t.Fatal("created memory still exists after undo")
	}

	persisted, err := server.app.FindRecordById(messagesCollection, assistantMessage.Id)
	if err != nil {
		t.Fatal(err)
	}
	parts, err := decodeStoredParts(persisted)
	if err != nil {
		t.Fatal(err)
	}
	var persistedResult workmemory.UpsertResult
	if len(parts) != 1 || decodeMemoryUpsertResult(parts[0]["output"], &persistedResult) != nil || persistedResult.Action != "undone" {
		t.Fatalf("tool output was not persisted as undone: %#v", parts)
	}

	duplicate := server.request(t, http.MethodPost, "/api/chat/messages/"+assistantMessage.Id+"/memory-actions/memory-call-1/undo", "")
	if duplicate.Code != http.StatusOK {
		t.Fatalf("idempotent undo: %d %s", duplicate.Code, duplicate.Body.String())
	}
}

func TestActiveRunCanReplayHistoryAndContinueStreaming(t *testing.T) {
	runner := &blockingRunner{started: make(chan struct{}), release: make(chan struct{})}
	server := newChatTestServerWithRunner(t, runner)
	conversationID := server.createConversation(t)

	initialDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		initialDone <- server.streamMessage(t, conversationID)
	}()
	<-runner.started
	unauthorized := httptest.NewRecorder()
	server.handler.ServeHTTP(
		unauthorized,
		httptest.NewRequest(http.MethodGet, "/api/chat/runs/00000000-0000-4000-8000-000000000001/stream", nil),
	)
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("expected unauthenticated resume to return 401, got %d", unauthorized.Code)
	}

	duplicate := server.request(t, http.MethodPost, "/api/chat/stream", `{
		"runId":"00000000-0000-4000-8000-000000000002",
		"conversationId":"`+conversationID+`",
		"modelConfigId":"`+server.modelID+`",
		"message":{"role":"user","parts":[{"type":"text","text":"Duplicate"}]}
	}`)
	if duplicate.Code != http.StatusConflict {
		t.Fatalf("expected duplicate run conflict, got %d: %s", duplicate.Code, duplicate.Body.String())
	}

	resumeRecorder := &signalingRecorder{ResponseRecorder: httptest.NewRecorder(), wrote: make(chan struct{}, 1)}
	resumeRequest := httptest.NewRequest(http.MethodGet, "/api/chat/runs/00000000-0000-4000-8000-000000000001/stream", nil)
	resumeRequest.Header.Set("Authorization", server.token)
	resumeDone := make(chan struct{})
	go func() {
		server.handler.ServeHTTP(resumeRecorder, resumeRequest)
		close(resumeDone)
	}()
	<-resumeRecorder.wrote
	close(runner.release)

	initial := <-initialDone
	<-resumeDone
	resumed := resumeRecorder.ResponseRecorder
	if initial.Code != http.StatusOK || resumed.Code != http.StatusOK {
		t.Fatalf("unexpected stream statuses: initial=%d resumed=%d", initial.Code, resumed.Code)
	}
	for _, expected := range []string{"before reconnect", "after reconnect", "data: [DONE]"} {
		if !strings.Contains(resumed.Body.String(), expected) {
			t.Fatalf("resumed stream missing %q: %s", expected, resumed.Body.String())
		}
	}

	completed := server.request(t, http.MethodGet, "/api/chat/runs/00000000-0000-4000-8000-000000000001/stream", "")
	if completed.Code != http.StatusNoContent {
		t.Fatalf("expected completed run to return 204, got %d", completed.Code)
	}
}

func TestApprovalResponseEndpointResolvesPendingDecisionOnce(t *testing.T) {
	server := newChatTestServer(t)
	runCtx, cancel := context.WithCancel(context.Background())
	defer cancel()
	run := newActiveRun("approval-run", server.ownerID, "conversation-1", cancel)
	if !server.service.registerRun(run) {
		t.Fatal("could not register approval test run")
	}
	defer server.service.removeRun(run)

	ready := make(chan string, 1)
	decisionDone := make(chan approvalDecision, 1)
	go func() {
		_, decision, err := run.awaitApproval(runCtx, workagent.ApprovalRequest{ToolCallID: "call-1", ToolName: "board_delete_task"}, func(approvalID string) {
			ready <- approvalID
		})
		if err == nil {
			decisionDone <- decision
		}
	}()
	approvalID := <-ready

	missing := server.request(t, http.MethodPost, "/api/chat/runs/approval-run/approvals/"+approvalID, `{}`)
	if missing.Code != http.StatusBadRequest {
		t.Fatalf("missing decision: %d %s", missing.Code, missing.Body.String())
	}
	response := server.request(t, http.MethodPost, "/api/chat/runs/approval-run/approvals/"+approvalID, `{"approved":false}`)
	if response.Code != http.StatusAccepted {
		t.Fatalf("respond approval: %d %s", response.Code, response.Body.String())
	}
	if decision := <-decisionDone; decision.Approved {
		t.Fatalf("unexpected approval decision: %#v", decision)
	}
	duplicate := server.request(t, http.MethodPost, "/api/chat/runs/approval-run/approvals/"+approvalID, `{"approved":true}`)
	if duplicate.Code != http.StatusConflict {
		t.Fatalf("duplicate decision: %d %s", duplicate.Code, duplicate.Body.String())
	}
}

func TestApprovalEventsStreamAndResumeTheAgentRun(t *testing.T) {
	runner := &approvalRunner{started: make(chan struct{})}
	server := newChatTestServerWithRunner(t, runner)
	conversationID := server.createConversation(t)
	streamDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		streamDone <- server.streamMessage(t, conversationID)
	}()
	<-runner.started

	run := server.service.findRun("00000000-0000-4000-8000-000000000001", server.ownerID)
	if run == nil {
		t.Fatal("approval run was not registered")
	}
	index := 0
	approvalID := ""
	for approvalID == "" {
		chunks, _, notify := run.readFrom(index)
		for _, chunk := range chunks {
			if chunk.Type == "tool-approval-request" {
				approvalID = chunk.ApprovalID
				break
			}
		}
		index += len(chunks)
		if approvalID == "" {
			<-notify
		}
	}

	response := server.request(t, http.MethodPost, "/api/chat/runs/00000000-0000-4000-8000-000000000001/approvals/"+approvalID, `{"approved":true}`)
	if response.Code != http.StatusAccepted {
		t.Fatalf("approve tool: %d %s", response.Code, response.Body.String())
	}
	stream := <-streamDone
	for _, expected := range []string{`"type":"data-approval"`, `"type":"tool-approval-request"`, `"type":"tool-approval-response"`, `"approved":true`, `"confirmLabel":"Delete"`, `"confirmVariant":"destructive"`, `"label":"Project"`, `"type":"tool-output-available"`} {
		if !strings.Contains(stream.Body.String(), expected) {
			t.Fatalf("approval stream missing %s: %s", expected, stream.Body.String())
		}
	}
}

func TestStoppedRunPersistsCancelledStatusAndRunID(t *testing.T) {
	runner := &blockingRunner{started: make(chan struct{}), release: make(chan struct{})}
	server := newChatTestServerWithRunner(t, runner)
	conversationID := server.createConversation(t)

	streamDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		streamDone <- server.streamMessage(t, conversationID)
	}()
	<-runner.started

	stopped := server.request(t, http.MethodPost, "/api/chat/runs/00000000-0000-4000-8000-000000000001/stop", "")
	if stopped.Code != http.StatusAccepted {
		t.Fatalf("stop run: %d %s", stopped.Code, stopped.Body.String())
	}
	stream := <-streamDone
	if !strings.Contains(stream.Body.String(), `"type":"abort"`) {
		t.Fatalf("stopped stream did not emit abort: %s", stream.Body.String())
	}

	messages := server.request(t, http.MethodGet, "/api/chat/conversations/"+conversationID+"/messages", "")
	var result []workagent.Message
	if err := json.Unmarshal(messages.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result) != 2 || result[1].Metadata["status"] != "cancelled" || result[1].Metadata["runId"] != "00000000-0000-4000-8000-000000000001" {
		t.Fatalf("unexpected cancelled message: %#v", result)
	}
}

func TestRecoverInterruptedRunsMarksStreamingMessagesAsError(t *testing.T) {
	server := newChatTestServer(t)
	conversationID := server.createConversation(t)
	collection, err := server.app.FindCollectionByNameOrId(messagesCollection)
	if err != nil {
		t.Fatal(err)
	}
	message := core.NewRecord(collection)
	message.Set("conversation", conversationID)
	message.Set("sequence", 0)
	message.Set("role", "assistant")
	message.Set("status", "streaming")
	message.Set("parts", []workagent.Part{{"type": "text", "text": "partial", "state": "streaming"}})
	message.Set("metadata", map[string]any{"runId": "interrupted-run"})
	if err := server.app.Save(message); err != nil {
		t.Fatal(err)
	}

	if err := recoverInterruptedRuns(server.app); err != nil {
		t.Fatal(err)
	}
	recovered, err := server.app.FindRecordById(messagesCollection, message.Id)
	if err != nil {
		t.Fatal(err)
	}
	metadata := messageMetadata(recovered)
	errorMetadata, _ := metadata["error"].(map[string]any)
	if recovered.GetString("status") != "error" || errorMetadata["code"] != "run_interrupted" || metadata["runId"] != "interrupted-run" {
		t.Fatalf("unexpected recovered message: status=%s metadata=%#v", recovered.GetString("status"), metadata)
	}
}

func TestPocketBaseApiRulesSeparateActiveAndArchivedConversations(t *testing.T) {
	server := newChatTestServer(t)
	activeID := server.createConversation(t)
	archivedID := server.createConversation(t)

	// Archive the second conversation via the built-in Records API.
	update := server.request(t, http.MethodPatch, "/api/collections/chat_conversations/records/"+archivedID, `{"status":"archived"}`)
	if update.Code != http.StatusOK {
		t.Fatalf("archive conversation: %d %s", update.Code, update.Body.String())
	}

	// List active conversations via the built-in Records API.
	activeList := server.request(t, http.MethodGet, "/api/collections/chat_conversations/records?filter=(status='active')&sort=-created", "")
	if activeList.Code != http.StatusOK {
		t.Fatalf("list active conversations: %d %s", activeList.Code, activeList.Body.String())
	}
	var activePage struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
	}
	if err := json.Unmarshal(activeList.Body.Bytes(), &activePage); err != nil {
		t.Fatal(err)
	}
	if len(activePage.Items) != 1 || activePage.Items[0].ID != activeID {
		t.Fatalf("unexpected active conversations: %#v", activePage.Items)
	}

	// List archived conversations via the built-in Records API (paginated).
	archivedList := server.request(t, http.MethodGet, "/api/collections/chat_conversations/records?filter=(status='archived')&sort=-updated&page=1&perPage=10", "")
	if archivedList.Code != http.StatusOK {
		t.Fatalf("list archived conversations: %d %s", archivedList.Code, archivedList.Body.String())
	}
	var archivedPage struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
		TotalItems int `json:"totalItems"`
		TotalPages int `json:"totalPages"`
	}
	if err := json.Unmarshal(archivedList.Body.Bytes(), &archivedPage); err != nil {
		t.Fatal(err)
	}
	if archivedPage.TotalItems != 1 ||
		archivedPage.TotalPages != 1 ||
		len(archivedPage.Items) != 1 ||
		archivedPage.Items[0].ID != archivedID {
		t.Fatalf("unexpected archived conversations page: %#v", archivedPage)
	}
}

func TestPanickedRunPublishesAndPersistsAnError(t *testing.T) {
	server := newChatTestServerWithRunner(t, panicRunner{})
	conversationID := server.createConversation(t)
	stream := server.streamMessage(t, conversationID)
	if stream.Code != http.StatusOK {
		t.Fatalf("stream: %d %s", stream.Code, stream.Body.String())
	}
	if !strings.Contains(stream.Body.String(), `"type":"error"`) || !strings.Contains(stream.Body.String(), "data: [DONE]") {
		t.Fatalf("panic was not represented as a completed error stream: %s", stream.Body.String())
	}

	messages := server.request(t, http.MethodGet, "/api/chat/conversations/"+conversationID+"/messages", "")
	var result []workagent.Message
	if err := json.Unmarshal(messages.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result) != 2 || result[1].Metadata["status"] != "error" {
		t.Fatalf("panicked assistant message was not marked as error: %#v", result)
	}
}

func TestProviderErrorDetailsStayServerSide(t *testing.T) {
	server := newChatTestServerWithRunner(t, errorRunner{})
	conversationID := server.createConversation(t)
	stream := server.streamMessage(t, conversationID)
	if strings.Contains(stream.Body.String(), "provider-secret-diagnostic") {
		t.Fatalf("stream exposed provider diagnostics: %s", stream.Body.String())
	}
	messages := server.request(t, http.MethodGet, "/api/chat/conversations/"+conversationID+"/messages", "")
	if strings.Contains(messages.Body.String(), "provider-secret-diagnostic") {
		t.Fatalf("persisted message exposed provider diagnostics: %s", messages.Body.String())
	}
}

func TestChatStreamRequiresModelConfig(t *testing.T) {
	server := newChatTestServer(t)
	conversationID := server.createConversation(t)
	response := server.request(t, http.MethodPost, "/api/chat/stream", `{
		"conversationId":"`+conversationID+`",
		"message":{"role":"user","parts":[{"type":"text","text":"Hello"}]}
	}`)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", response.Code, response.Body.String())
	}
}
