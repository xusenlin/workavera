package llm

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	_ "github.com/xusenlin/workavera/migrations"
)

type llmTestServer struct {
	app         *tests.TestApp
	handler     http.Handler
	ownerID     string
	ownerToken  string
	targetID    string
	targetToken string
}

func newLLMTestServer(t *testing.T) *llmTestServer {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	owner, ownerToken := createTestUser(t, app, "llm-owner@example.com", "LLM Owner")
	target, targetToken := createTestUser(t, app, "llm-recipient@example.com", "LLM Recipient")

	Register(app)
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	serveEvent := &core.ServeEvent{App: app, Router: router}
	if err := app.OnServe().Trigger(serveEvent, func(event *core.ServeEvent) error {
		return event.Next()
	}); err != nil {
		t.Fatal(err)
	}
	handler, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}

	return &llmTestServer{
		app:         app,
		handler:     handler,
		ownerID:     owner.Id,
		ownerToken:  ownerToken,
		targetID:    target.Id,
		targetToken: targetToken,
	}
}

func createTestUser(t *testing.T, app core.App, email, name string) (*core.Record, string) {
	t.Helper()
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(users)
	record.SetEmail(email)
	record.SetPassword("password123")
	record.Set("name", name)
	record.SetVerified(true)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	token, err := record.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	return record, token
}

func (server *llmTestServer) request(t *testing.T, method, path, token, body string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("content-type", "application/json")
	if token != "" {
		request.Header.Set("Authorization", token)
	}
	server.handler.ServeHTTP(recorder, request)
	return recorder
}

func decodeModelResponse(t *testing.T, recorder *httptest.ResponseRecorder) modelResponse {
	t.Helper()
	var response modelResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response %q: %v", recorder.Body.String(), err)
	}
	return response
}

func TestModelsAPIRequiresAuthentication(t *testing.T) {
	server := newLLMTestServer(t)
	response := server.request(t, http.MethodGet, "/api/llm/models", "", "")
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", response.Code, response.Body.String())
	}
}

func TestModelsCRUDAndDefaultLifecycle(t *testing.T) {
	server := newLLMTestServer(t)

	created := server.request(t, http.MethodPost, "/api/llm/models", server.ownerToken, `{
		"name":"Primary",
		"modelId":"gpt-4o",
		"baseUrl":"https://api.openai.com/v1",
		"apiKey":"secret-token",
		"protocol":"openai"
	}`)
	if created.Code != http.StatusCreated {
		t.Fatalf("create: expected 201, got %d: %s", created.Code, created.Body.String())
	}
	if strings.Contains(created.Body.String(), "secret-token") || strings.Contains(created.Body.String(), "api_key") {
		t.Fatalf("response leaked API key: %s", created.Body.String())
	}
	first := decodeModelResponse(t, created)
	if !first.IsDefault || !first.HasAPIKey {
		t.Fatalf("first model should be default with a configured key: %#v", first)
	}

	updated := server.request(
		t,
		http.MethodPatch,
		"/api/llm/models/"+first.ID,
		server.ownerToken,
		`{"name":"Renamed"}`,
	)
	if updated.Code != http.StatusOK {
		t.Fatalf("update: expected 200, got %d: %s", updated.Code, updated.Body.String())
	}
	storedFirst, err := server.app.FindRecordById(modelsCollection, first.ID)
	if err != nil {
		t.Fatal(err)
	}
	if storedFirst.GetString("api_key") != "secret-token" {
		t.Fatal("omitted apiKey should preserve the saved key")
	}

	secondCreated := server.request(t, http.MethodPost, "/api/llm/models", server.ownerToken, `{
		"name":"Gemini",
		"modelId":"gemini-2.5-flash",
		"baseUrl":"https://generativelanguage.googleapis.com/v1beta",
		"protocol":"google"
	}`)
	if secondCreated.Code != http.StatusCreated {
		t.Fatalf("create second: expected 201, got %d: %s", secondCreated.Code, secondCreated.Body.String())
	}
	second := decodeModelResponse(t, secondCreated)
	if second.IsDefault {
		t.Fatal("only the first model should become default automatically")
	}

	setDefault := server.request(
		t,
		http.MethodPost,
		"/api/llm/models/"+second.ID+"/default",
		server.ownerToken,
		"",
	)
	if setDefault.Code != http.StatusOK {
		t.Fatalf("set default: expected 200, got %d: %s", setDefault.Code, setDefault.Body.String())
	}
	storedFirst, _ = server.app.FindRecordById(modelsCollection, first.ID)
	storedSecond, _ := server.app.FindRecordById(modelsCollection, second.ID)
	if storedFirst.GetBool("is_default") || !storedSecond.GetBool("is_default") {
		t.Fatal("exactly the selected model should be default")
	}

	deleted := server.request(
		t,
		http.MethodDelete,
		"/api/llm/models/"+second.ID,
		server.ownerToken,
		"",
	)
	if deleted.Code != http.StatusNoContent {
		t.Fatalf("delete: expected 204, got %d: %s", deleted.Code, deleted.Body.String())
	}
	storedFirst, _ = server.app.FindRecordById(modelsCollection, first.ID)
	if !storedFirst.GetBool("is_default") {
		t.Fatal("oldest remaining model should be promoted after deleting the default")
	}

	cleared := server.request(
		t,
		http.MethodPatch,
		"/api/llm/models/"+first.ID,
		server.ownerToken,
		`{"apiKey":""}`,
	)
	if cleared.Code != http.StatusOK || decodeModelResponse(t, cleared).HasAPIKey {
		t.Fatalf("empty apiKey should clear the saved key: %s", cleared.Body.String())
	}
}

func TestCopyModelCreatesIndependentSecretCopy(t *testing.T) {
	server := newLLMTestServer(t)
	created := server.request(t, http.MethodPost, "/api/llm/models", server.ownerToken, `{
		"name":"Shared model",
		"modelId":"claude-sonnet-4",
		"baseUrl":"https://api.anthropic.com/v1",
		"apiKey":"shared-secret",
		"protocol":"anthropic"
	}`)
	if created.Code != http.StatusCreated {
		t.Fatalf("create: %d: %s", created.Code, created.Body.String())
	}
	source := decodeModelResponse(t, created)

	copyResponse := server.request(
		t,
		http.MethodPost,
		"/api/llm/models/"+source.ID+"/copy",
		server.ownerToken,
		`{"userIds":["`+server.targetID+`"]}`,
	)
	if copyResponse.Code != http.StatusCreated || !strings.Contains(copyResponse.Body.String(), `"copied":1`) {
		t.Fatalf("copy: expected one copy, got %d: %s", copyResponse.Code, copyResponse.Body.String())
	}
	if strings.Contains(copyResponse.Body.String(), "shared-secret") {
		t.Fatalf("copy response leaked API key: %s", copyResponse.Body.String())
	}

	copy, err := server.app.FindFirstRecordByFilter(
		modelsCollection,
		"owner = {:owner}",
		dbx.Params{"owner": server.targetID},
	)
	if err != nil {
		t.Fatal(err)
	}
	if copy.GetString("api_key") != "shared-secret" || !copy.GetBool("is_default") {
		t.Fatal("recipient should receive the full configuration as its first default")
	}

	recipientEdit := server.request(
		t,
		http.MethodPatch,
		"/api/llm/models/"+copy.Id,
		server.targetToken,
		`{"name":"Recipient edit"}`,
	)
	if recipientEdit.Code != http.StatusOK {
		t.Fatalf("recipient edit: %d: %s", recipientEdit.Code, recipientEdit.Body.String())
	}
	storedSource, err := server.app.FindRecordById(modelsCollection, source.ID)
	if err != nil {
		t.Fatal(err)
	}
	if storedSource.GetString("name") != "Shared model" {
		t.Fatal("recipient changes must not affect the source model")
	}

	forbidden := server.request(
		t,
		http.MethodPatch,
		"/api/llm/models/"+source.ID,
		server.targetToken,
		`{"name":"Not allowed"}`,
	)
	if forbidden.Code != http.StatusNotFound {
		t.Fatalf("recipient must not edit source model, got %d", forbidden.Code)
	}
}
