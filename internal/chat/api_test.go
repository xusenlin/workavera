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

type chatTestServer struct {
	app     *tests.TestApp
	handler http.Handler
	token   string
	modelID string
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

	register(app, newService(app, runner))
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
	return &chatTestServer{app: app, handler: handler, token: token, modelID: model.Id}
}

func (server *chatTestServer) createConversation(t *testing.T) conversationResponse {
	t.Helper()
	created := server.request(t, http.MethodPost, "/api/chat/conversations", `{"title":"Test"}`)
	if created.Code != http.StatusCreated {
		t.Fatalf("create conversation: %d %s", created.Code, created.Body.String())
	}
	var conversation conversationResponse
	if err := json.Unmarshal(created.Body.Bytes(), &conversation); err != nil {
		t.Fatal(err)
	}
	return conversation
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
	conversation := server.createConversation(t)
	stream := server.streamMessage(t, conversation.ID)
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

	messages := server.request(t, http.MethodGet, "/api/chat/conversations/"+conversation.ID+"/messages", "")
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
}

func TestPanickedRunPublishesAndPersistsAnError(t *testing.T) {
	server := newChatTestServerWithRunner(t, panicRunner{})
	conversation := server.createConversation(t)
	stream := server.streamMessage(t, conversation.ID)
	if stream.Code != http.StatusOK {
		t.Fatalf("stream: %d %s", stream.Code, stream.Body.String())
	}
	if !strings.Contains(stream.Body.String(), `"type":"error"`) || !strings.Contains(stream.Body.String(), "data: [DONE]") {
		t.Fatalf("panic was not represented as a completed error stream: %s", stream.Body.String())
	}

	messages := server.request(t, http.MethodGet, "/api/chat/conversations/"+conversation.ID+"/messages", "")
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
	conversation := server.createConversation(t)
	stream := server.streamMessage(t, conversation.ID)
	if strings.Contains(stream.Body.String(), "provider-secret-diagnostic") {
		t.Fatalf("stream exposed provider diagnostics: %s", stream.Body.String())
	}
	messages := server.request(t, http.MethodGet, "/api/chat/conversations/"+conversation.ID+"/messages", "")
	if strings.Contains(messages.Body.String(), "provider-secret-diagnostic") {
		t.Fatalf("persisted message exposed provider diagnostics: %s", messages.Body.String())
	}
}

func TestChatStreamRequiresModelConfig(t *testing.T) {
	server := newChatTestServer(t)
	created := server.request(t, http.MethodPost, "/api/chat/conversations", `{"title":"Test"}`)
	var conversation conversationResponse
	if err := json.Unmarshal(created.Body.Bytes(), &conversation); err != nil {
		t.Fatal(err)
	}
	response := server.request(t, http.MethodPost, "/api/chat/stream", `{
		"conversationId":"`+conversation.ID+`",
		"message":{"role":"user","parts":[{"type":"text","text":"Hello"}]}
	}`)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", response.Code, response.Body.String())
	}
}
