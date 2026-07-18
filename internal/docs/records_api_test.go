package docs

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	_ "github.com/xusenlin/workavera/migrations"
)

func TestFolderRecordsAPIAndDocumentFolderMove(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	owner := createTestUser(t, app, "folder-api-owner@example.com")
	token, err := owner.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}

	Register(app)
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	if err := app.OnServe().Trigger(&core.ServeEvent{App: app, Router: router}, func(event *core.ServeEvent) error { return event.Next() }); err != nil {
		t.Fatal(err)
	}
	handler, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}

	response := recordsRequest(t, handler, token, http.MethodPost, "/api/collections/doc_folders/records", map[string]any{"name": "  Plans  "})
	if response.Code != http.StatusOK {
		t.Fatalf("create folder: %d %s", response.Code, response.Body.String())
	}
	var folder struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		Owner string `json:"owner"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &folder); err != nil {
		t.Fatal(err)
	}
	if folder.ID == "" || folder.Name != "Plans" || folder.Owner != owner.Id {
		t.Fatalf("folder hook did not normalize ownership/name: %#v", folder)
	}

	duplicate := recordsRequest(t, handler, token, http.MethodPost, "/api/collections/doc_folders/records", map[string]any{"name": "plans"})
	if duplicate.Code != http.StatusBadRequest {
		t.Fatalf("case-insensitive duplicate accepted: %d %s", duplicate.Code, duplicate.Body.String())
	}

	doc, err := Create(t.Context(), app, owner.Id, CreateInput{Title: "Root"})
	if err != nil {
		t.Fatal(err)
	}
	moved := recordsRequest(t, handler, token, http.MethodPatch, "/api/collections/docs/records/"+doc.ID, map[string]any{"folder": folder.ID})
	if moved.Code != http.StatusOK {
		t.Fatalf("move document to folder: %d %s", moved.Code, moved.Body.String())
	}
	stored, err := app.FindRecordById(CollectionName, doc.ID)
	if err != nil || stored.GetString("folder") != folder.ID || stored.GetInt("revision") != 1 {
		t.Fatalf("unexpected moved document: %#v, %v", stored, err)
	}

	bypass := recordsRequest(t, handler, token, http.MethodPatch, "/api/collections/docs/records/"+doc.ID, map[string]any{"content": "bypass"})
	if bypass.Code != http.StatusNotFound {
		t.Fatalf("content mutation bypassed version endpoint: %d %s", bypass.Code, bypass.Body.String())
	}

	deleted := recordsRequest(t, handler, token, http.MethodDelete, "/api/collections/doc_folders/records/"+folder.ID, nil)
	if deleted.Code != http.StatusNoContent {
		t.Fatalf("delete folder: %d %s", deleted.Code, deleted.Body.String())
	}
	stored, err = app.FindRecordById(CollectionName, doc.ID)
	if err != nil || stored.GetString("folder") != "" || stored.GetInt("revision") != 1 {
		t.Fatalf("folder delete did not return document to My documents: %#v, %v", stored, err)
	}
}

func recordsRequest(t *testing.T, handler http.Handler, token, method, path string, body map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	var payload []byte
	var err error
	if body != nil {
		payload, err = json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
	}
	request := httptest.NewRequest(method, path, bytes.NewReader(payload))
	request.Header.Set("Authorization", token)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}
