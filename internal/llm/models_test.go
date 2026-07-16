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
	if first.MaxContextTokens != defaultMaxContextTokens {
		t.Fatalf("omitted maxContextTokens should default to %d, got %d", defaultMaxContextTokens, first.MaxContextTokens)
	}

	updated := server.request(
		t,
		http.MethodPatch,
		"/api/llm/models/"+first.ID,
		server.ownerToken,
		`{"name":"Renamed","maxContextTokens":1000000}`,
	)
	if updated.Code != http.StatusOK {
		t.Fatalf("update: expected 200, got %d: %s", updated.Code, updated.Body.String())
	}
	if renamed := decodeModelResponse(t, updated); renamed.MaxContextTokens != 1000000 {
		t.Fatalf("update should store maxContextTokens, got %d", renamed.MaxContextTokens)
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

func TestShareModelRequiresAcceptanceAndCopiesCurrentConfiguration(t *testing.T) {
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

	shareResponse := server.request(
		t,
		http.MethodPost,
		"/api/llm/models/"+source.ID+"/share",
		server.ownerToken,
		`{"userIds":["`+server.targetID+`"]}`,
	)
	if shareResponse.Code != http.StatusCreated || !strings.Contains(shareResponse.Body.String(), `"shared":1`) {
		t.Fatalf("share: expected one invitation, got %d: %s", shareResponse.Code, shareResponse.Body.String())
	}
	if strings.Contains(shareResponse.Body.String(), "shared-secret") {
		t.Fatalf("share response leaked API key: %s", shareResponse.Body.String())
	}

	if _, err := server.app.FindFirstRecordByFilter(
		modelsCollection,
		"owner = {:owner}",
		dbx.Params{"owner": server.targetID},
	); err == nil {
		t.Fatal("sharing must not create a model before acceptance")
	}
	notification, err := server.app.FindFirstRecordByFilter("notifications", "recipient = {:recipient} && type = 'model_share'", dbx.Params{"recipient": server.targetID})
	if err != nil {
		t.Fatal(err)
	}

	// Acceptance copies the inviter's current configuration.
	storedSource, err := server.app.FindRecordById(modelsCollection, source.ID)
	if err != nil {
		t.Fatal(err)
	}
	storedSource.Set("name", "Source changed later")
	storedSource.Set("api_key", "new-secret")
	if err := server.app.Save(storedSource); err != nil {
		t.Fatal(err)
	}

	accepted := server.request(t, http.MethodPost, "/api/llm/shares/"+notification.Id+"/respond", server.targetToken, `{"decision":"accept"}`)
	if accepted.Code != http.StatusOK {
		t.Fatalf("accept: expected 200, got %d: %s", accepted.Code, accepted.Body.String())
	}
	copy, err := server.app.FindFirstRecordByFilter(modelsCollection, "owner = {:owner}", dbx.Params{"owner": server.targetID})
	if err != nil {
		t.Fatal(err)
	}
	if copy.GetString("api_key") != "new-secret" || !copy.GetBool("is_default") {
		t.Fatal("recipient should receive the current configuration as its first default")
	}
	if copy.GetString("name") != "Source changed later" {
		t.Fatal("accepted configuration should use the latest source values")
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
	storedSource, err = server.app.FindRecordById(modelsCollection, source.ID)
	if err != nil {
		t.Fatal(err)
	}
	if storedSource.GetString("name") != "Source changed later" {
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

func TestSharedFromBlocksOnwardSharing(t *testing.T) {
	server := newLLMTestServer(t)
	created := server.request(t, http.MethodPost, "/api/llm/models", server.ownerToken, `{
		"name":"Author model",
		"modelId":"claude-sonnet-4",
		"baseUrl":"https://api.anthropic.com/v1",
		"apiKey":"author-secret",
		"protocol":"anthropic"
	}`)
	if created.Code != http.StatusCreated {
		t.Fatalf("create: %d: %s", created.Code, created.Body.String())
	}
	source := decodeModelResponse(t, created)
	if source.SharedFrom != "" {
		t.Fatal("author-created model must not have a shared_from author")
	}

	share := server.request(t, http.MethodPost, "/api/llm/models/"+source.ID+"/share", server.ownerToken, `{"userIds":["`+server.targetID+`"]}`)
	if share.Code != http.StatusCreated {
		t.Fatalf("share: %d: %s", share.Code, share.Body.String())
	}
	notification, err := server.app.FindFirstRecordByFilter("notifications", "recipient = {:recipient} && type = 'model_share'", dbx.Params{"recipient": server.targetID})
	if err != nil {
		t.Fatal(err)
	}
	accepted := server.request(t, http.MethodPost, "/api/llm/shares/"+notification.Id+"/respond", server.targetToken, `{"decision":"accept"}`)
	if accepted.Code != http.StatusOK {
		t.Fatalf("accept: %d: %s", accepted.Code, accepted.Body.String())
	}

	copyRecord, err := server.app.FindFirstRecordByFilter(modelsCollection, "owner = {:owner}", dbx.Params{"owner": server.targetID})
	if err != nil {
		t.Fatal(err)
	}
	if copyRecord.GetString("shared_from") != server.ownerID {
		t.Fatalf("accepted copy must record the author it was shared from, got %q", copyRecord.GetString("shared_from"))
	}

	// The recipient's model list resolves the author id to a display name.
	list := server.request(t, http.MethodGet, "/api/llm/models", server.targetToken, "")
	if list.Code != http.StatusOK {
		t.Fatalf("list: %d: %s", list.Code, list.Body.String())
	}
	var models []modelResponse
	if err := json.Unmarshal(list.Body.Bytes(), &models); err != nil {
		t.Fatalf("decode list %q: %v", list.Body.String(), err)
	}
	if len(models) != 1 {
		t.Fatalf("recipient should have one model, got %d", len(models))
	}
	if models[0].SharedFrom != server.ownerID || models[0].SharedFromName != "LLM Owner" {
		t.Fatalf("list must surface the sharer id and name, got sharedFrom=%q sharedFromName=%q", models[0].SharedFrom, models[0].SharedFromName)
	}

	// The recipient must not be able to share the received copy onward.
	reshare := server.request(t, http.MethodPost, "/api/llm/models/"+copyRecord.Id+"/share", server.targetToken, `{"userIds":["`+server.ownerID+`"]}`)
	if reshare.Code != http.StatusForbidden {
		t.Fatalf("re-share of a received copy must be forbidden, got %d: %s", reshare.Code, reshare.Body.String())
	}
}

func TestValidateShareRecipientsRejectsMissingUsersAndSender(t *testing.T) {
	server := newLLMTestServer(t)
	if err := validateShareRecipients(server.app, []string{server.targetID}, server.ownerID); err != nil {
		t.Fatalf("valid recipient was rejected: %v", err)
	}
	if err := validateShareRecipients(server.app, []string{"missing-user"}, server.ownerID); err == nil {
		t.Fatal("missing recipient was accepted")
	}
	if err := validateShareRecipients(server.app, []string{server.ownerID}, server.ownerID); err == nil {
		t.Fatal("sender was accepted as a recipient")
	}
}

func TestRejectModelShareDoesNotCreateConfiguration(t *testing.T) {
	server := newLLMTestServer(t)
	created := server.request(t, http.MethodPost, "/api/llm/models", server.ownerToken, `{
		"name":"Declined model",
		"modelId":"gpt-4o-mini",
		"baseUrl":"https://api.openai.com/v1",
		"protocol":"openai"
	}`)
	if created.Code != http.StatusCreated {
		t.Fatalf("create: %d: %s", created.Code, created.Body.String())
	}
	source := decodeModelResponse(t, created)
	shared := server.request(t, http.MethodPost, "/api/llm/models/"+source.ID+"/share", server.ownerToken, `{"userIds":["`+server.targetID+`"]}`)
	if shared.Code != http.StatusCreated {
		t.Fatalf("share: %d: %s", shared.Code, shared.Body.String())
	}
	notification, err := server.app.FindFirstRecordByFilter("notifications", "recipient = {:recipient} && type = 'model_share'", dbx.Params{"recipient": server.targetID})
	if err != nil {
		t.Fatal(err)
	}
	rejected := server.request(t, http.MethodPost, "/api/llm/shares/"+notification.Id+"/respond", server.targetToken, `{"decision":"reject"}`)
	if rejected.Code != http.StatusOK {
		t.Fatalf("reject: %d: %s", rejected.Code, rejected.Body.String())
	}
	if count, _ := server.app.CountRecords(modelsCollection, dbx.HashExp{"owner": server.targetID}); count != 0 {
		t.Fatalf("rejection must not create a model, got %d", count)
	}
	repeated := server.request(t, http.MethodPost, "/api/llm/shares/"+notification.Id+"/respond", server.targetToken, `{"decision":"reject"}`)
	if repeated.Code != http.StatusOK {
		t.Fatalf("repeated rejection should be idempotent: %d", repeated.Code)
	}
	accepted := server.request(t, http.MethodPost, "/api/llm/shares/"+notification.Id+"/respond", server.targetToken, `{"decision":"accept"}`)
	if accepted.Code != http.StatusConflict {
		t.Fatalf("opposite response after rejection should conflict: %d", accepted.Code)
	}
}
