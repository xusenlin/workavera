package docs

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	_ "github.com/xusenlin/workavera/migrations"
)

func TestPublicShareEndpointsServeAnonymousVisitors(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	owner := createTestUser(t, app, "share-api-owner@example.com")
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

	doc, err := Create(context.Background(), app, owner.Id, CreateInput{Title: "Shared notes", Content: "hello"})
	if err != nil {
		t.Fatal(err)
	}
	asset, err := UploadAsset(context.Background(), app, owner.Id, doc.ID, testPNG(t, "chart.png"))
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := Update(context.Background(), app, owner.Id, doc.ID, UpdateInput{
		Title:        "Shared notes",
		Content:      fmt.Sprintf("hello\n\n![chart](%s)", asset.URL),
		BaseRevision: 1,
	}); err != nil {
		t.Fatal(err)
	}

	// Not shared yet: the owner's own share endpoint reports nothing.
	empty := recordsRequest(t, handler, token, http.MethodGet, "/api/docs/"+doc.ID+"/share", nil)
	if empty.Code != http.StatusOK || strings.TrimSpace(empty.Body.String()) != "null" {
		t.Fatalf("unshared document: %d %s", empty.Code, empty.Body.String())
	}

	created := recordsRequest(t, handler, token, http.MethodPost, "/api/docs/"+doc.ID+"/share", map[string]any{})
	if created.Code != http.StatusOK {
		t.Fatalf("publish: %d %s", created.Code, created.Body.String())
	}
	var share Share
	if err := json.Unmarshal(created.Body.Bytes(), &share); err != nil {
		t.Fatal(err)
	}

	// Everything below runs without an Authorization header.
	public := recordsRequest(t, handler, "", http.MethodGet, "/api/public/docs/"+share.Slug, nil)
	if public.Code != http.StatusOK {
		t.Fatalf("anonymous read: %d %s", public.Code, public.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(public.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload["title"] != "Shared notes" || payload["kind"] != KindMarkdown {
		t.Fatalf("unexpected public payload: %#v", payload)
	}
	for _, private := range []string{"ownerId", "projectId", "folderId", "lastEditedBy", "id", "docId"} {
		if _, leaked := payload[private]; leaked {
			t.Fatalf("public payload leaked %q: %#v", private, payload)
		}
	}

	image := recordsRequest(t, handler, "", http.MethodGet, "/api/public/docs/"+share.Slug+"/assets/"+asset.ID, nil)
	if image.Code != http.StatusOK || image.Body.Len() == 0 {
		t.Fatalf("anonymous attachment: %d", image.Code)
	}

	// A slug can never be discovered by listing: PocketBase applies the list
	// rule as a filter, so an anonymous list comes back empty.
	listed := recordsRequest(t, handler, "", http.MethodGet, "/api/collections/doc_shares/records", nil)
	if strings.Contains(listed.Body.String(), share.Slug) {
		t.Fatalf("doc_shares listed anonymously: %s", listed.Body.String())
	}
	// Neither can the document behind it.
	record := recordsRequest(t, handler, "", http.MethodGet, "/api/collections/docs/records/"+doc.ID, nil)
	if record.Code == http.StatusOK {
		t.Fatalf("document read anonymously: %s", record.Body.String())
	}

	revoked := recordsRequest(t, handler, token, http.MethodDelete, "/api/docs/"+doc.ID+"/share", nil)
	if revoked.Code != http.StatusNoContent {
		t.Fatalf("revoke: %d %s", revoked.Code, revoked.Body.String())
	}
	gone := recordsRequest(t, handler, "", http.MethodGet, "/api/public/docs/"+share.Slug, nil)
	if gone.Code != http.StatusNotFound {
		t.Fatalf("revoked link still served: %d %s", gone.Code, gone.Body.String())
	}
}
