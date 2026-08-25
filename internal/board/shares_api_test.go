package board

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	_ "github.com/xusenlin/workavera/migrations"
)

func TestPublicBoardEndpointServesAnonymousVisitors(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	owner := createQueryTestUser(t, app, "board-api-owner@example.com", "API Owner")
	token, err := owner.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	project := createQueryTestProject(t, app, owner.Id, "Public API", false)
	state := createQueryTestState(t, app, project.Id)
	task := createQueryTestTask(t, app, project.Id, state.Id, owner.Id, []string{owner.Id})
	task.Set("title", "Ship the preview")
	task.Set("start_date", "2026-08-03")
	task.Set("due_date", "2026-08-07")
	if err := app.Save(task); err != nil {
		t.Fatal(err)
	}

	handler := buildShareTestHandler(t, app)

	// Not shared yet: the owner's own share endpoint reports nothing.
	empty := shareRequest(t, handler, token, http.MethodGet, "/api/board/projects/"+project.Id+"/share", nil)
	if empty.Code != http.StatusOK || strings.TrimSpace(empty.Body.String()) != "null" {
		t.Fatalf("unshared project: %d %s", empty.Code, empty.Body.String())
	}

	created := shareRequest(t, handler, token, http.MethodPost, "/api/board/projects/"+project.Id+"/share", map[string]any{})
	if created.Code != http.StatusOK {
		t.Fatalf("publish: %d %s", created.Code, created.Body.String())
	}
	var share Share
	if err := json.Unmarshal(created.Body.Bytes(), &share); err != nil {
		t.Fatal(err)
	}

	// Everything below runs without an Authorization header.
	public := shareRequest(t, handler, "", http.MethodGet, "/api/public/board/"+share.Slug, nil)
	if public.Code != http.StatusOK {
		t.Fatalf("anonymous read: %d %s", public.Code, public.Body.String())
	}
	var preview PublicPreview
	if err := json.Unmarshal(public.Body.Bytes(), &preview); err != nil {
		t.Fatal(err)
	}
	if preview.Project.Name != "Public API" || len(preview.Tasks) != 1 {
		t.Fatalf("unexpected preview: %#v", preview)
	}
	if preview.Tasks[0].StartDate != "2026-08-03" || preview.Tasks[0].DueDate != "2026-08-07" {
		t.Fatalf("a task must carry the span the timeline draws: %#v", preview.Tasks[0])
	}
	// Assignees, emails, and roles must not appear anywhere in the payload.
	for _, private := range []string{owner.Id, owner.Email(), "assignee", "role", "createdBy"} {
		if strings.Contains(public.Body.String(), private) {
			t.Fatalf("public payload leaked %q: %s", private, public.Body.String())
		}
	}

	// A slug can never be discovered by listing: PocketBase applies the list
	// rule as a filter, so an anonymous list comes back empty.
	listed := shareRequest(t, handler, "", http.MethodGet, "/api/collections/board_project_shares/records", nil)
	if strings.Contains(listed.Body.String(), share.Slug) {
		t.Fatalf("board_project_shares listed anonymously: %s", listed.Body.String())
	}
	// Neither can the project behind it.
	record := shareRequest(t, handler, "", http.MethodGet, "/api/collections/board_projects/records/"+project.Id, nil)
	if record.Code == http.StatusOK {
		t.Fatalf("project read anonymously: %s", record.Body.String())
	}

	revoked := shareRequest(t, handler, token, http.MethodDelete, "/api/board/projects/"+project.Id+"/share", nil)
	if revoked.Code != http.StatusNoContent {
		t.Fatalf("revoke: %d %s", revoked.Code, revoked.Body.String())
	}
	gone := shareRequest(t, handler, "", http.MethodGet, "/api/public/board/"+share.Slug, nil)
	if gone.Code != http.StatusNotFound {
		t.Fatalf("revoked link still served: %d %s", gone.Code, gone.Body.String())
	}
}

func buildShareTestHandler(t *testing.T, app *tests.TestApp) http.Handler {
	t.Helper()
	// Register binds to the concrete PocketBase app, so the routes are attached
	// to the test app's serve event directly.
	Register(&pocketbase.PocketBase{App: app})
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	if err := app.OnServe().Trigger(&core.ServeEvent{App: app, Router: router}, func(event *core.ServeEvent) error {
		return event.Next()
	}); err != nil {
		t.Fatal(err)
	}
	handler, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	return handler
}

func shareRequest(t *testing.T, handler http.Handler, token, method, path string, body map[string]any) *httptest.ResponseRecorder {
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
