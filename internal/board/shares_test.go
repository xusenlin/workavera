package board

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/types"
	_ "github.com/xusenlin/workavera/migrations"
)

func TestPublishIsOwnerOnlyAndReusesOneSlug(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	owner := createQueryTestUser(t, app, "share-owner@example.com", "Share Owner")
	member := createQueryTestUser(t, app, "share-member@example.com", "Share Member")
	project := createQueryTestProject(t, app, owner.Id, "Shared", false)
	createProjectTestMembership(t, app, project.Id, member.Id, "admin")

	share, err := Publish(context.Background(), app, owner.Id, project.Id, ShareInput{})
	if err != nil {
		t.Fatal(err)
	}
	if len(share.Slug) != shareSlugLength {
		t.Fatalf("unexpected slug: %q", share.Slug)
	}
	if share.Expires != "" {
		t.Fatalf("a share without an expiry must not carry one: %#v", share)
	}

	// Publishing again keeps the same link instead of issuing a second one.
	republished, err := Publish(context.Background(), app, owner.Id, project.Id, ShareInput{})
	if err != nil {
		t.Fatal(err)
	}
	if republished.Slug != share.Slug {
		t.Fatalf("expected the same slug, got %q and %q", share.Slug, republished.Slug)
	}

	// Project membership grants no sharing rights, matching archive and delete.
	if _, err := Publish(context.Background(), app, member.Id, project.Id, ShareInput{}); !errors.Is(err, ErrOwnerOnly) {
		t.Fatalf("expected owner-only error, got %v", err)
	}
	if _, err := GetShare(context.Background(), app, member.Id, project.Id); !errors.Is(err, ErrOwnerOnly) {
		t.Fatalf("expected owner-only error, got %v", err)
	}
	if err := Unpublish(context.Background(), app, member.Id, project.Id); !errors.Is(err, ErrOwnerOnly) {
		t.Fatalf("expected owner-only error, got %v", err)
	}
}

func TestPublishRejectsArchivedProjectAndPastExpiry(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	owner := createQueryTestUser(t, app, "archived-owner@example.com", "Archived Owner")
	archived := createQueryTestProject(t, app, owner.Id, "Archived", true)
	if _, err := Publish(context.Background(), app, owner.Id, archived.Id, ShareInput{}); !errors.Is(err, ErrProjectArchived) {
		t.Fatalf("expected archived project error, got %v", err)
	}

	active := createQueryTestProject(t, app, owner.Id, "Active", false)
	past := types.NowDateTime().Add(-time.Hour).String()
	if _, err := Publish(context.Background(), app, owner.Id, active.Id, ShareInput{Expires: past}); !errors.Is(err, ErrInvalidShareExpiry) {
		t.Fatalf("expected invalid expiry error, got %v", err)
	}
}

func TestUnpublishIssuesANewSlugOnTheNextPublish(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	owner := createQueryTestUser(t, app, "revoke-owner@example.com", "Revoke Owner")
	project := createQueryTestProject(t, app, owner.Id, "Revoked", false)

	first, err := Publish(context.Background(), app, owner.Id, project.Id, ShareInput{})
	if err != nil {
		t.Fatal(err)
	}
	if err := Unpublish(context.Background(), app, owner.Id, project.Id); err != nil {
		t.Fatal(err)
	}
	if _, err := GetShare(context.Background(), app, owner.Id, project.Id); !errors.Is(err, ErrShareNotFound) {
		t.Fatalf("expected the share to be gone, got %v", err)
	}
	if _, err := PublicPreviewBySlug(context.Background(), app, first.Slug); !errors.Is(err, ErrShareNotFound) {
		t.Fatalf("a revoked link must stop resolving, got %v", err)
	}

	second, err := Publish(context.Background(), app, owner.Id, project.Id, ShareInput{})
	if err != nil {
		t.Fatal(err)
	}
	if second.Slug == first.Slug {
		t.Fatal("republishing after a revoke must not revive the old slug")
	}
}

func TestPublicPreviewReportsProgressWithoutIdentities(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	owner := createQueryTestUser(t, app, "preview-owner@example.com", "Preview Owner")
	member := createQueryTestUser(t, app, "preview-member@example.com", "Preview Member")
	project := createQueryTestProject(t, app, owner.Id, "Preview", false)
	createProjectTestMembership(t, app, project.Id, member.Id, "member")
	todo := createQueryTestState(t, app, project.Id)
	done := createShareTestState(t, app, project.Id, "Done", "completed", 2048)

	planned := createQueryTestTask(t, app, project.Id, todo.Id, owner.Id, []string{owner.Id, member.Id})
	planned.Set("title", "Planned work")
	planned.Set("start_date", "2026-08-03")
	planned.Set("due_date", "2026-08-07")
	if err := app.Save(planned); err != nil {
		t.Fatal(err)
	}
	finished := createQueryTestTask(t, app, project.Id, done.Id, owner.Id, nil)
	finished.Set("title", "Finished work")
	finished.Set("due_date", "2026-09-12")
	if err := app.Save(finished); err != nil {
		t.Fatal(err)
	}
	hidden := createQueryTestTask(t, app, project.Id, todo.Id, owner.Id, nil)
	hidden.Set("title", "Archived work")
	hidden.Set("archived", true)
	if err := app.Save(hidden); err != nil {
		t.Fatal(err)
	}

	share, err := Publish(context.Background(), app, owner.Id, project.Id, ShareInput{})
	if err != nil {
		t.Fatal(err)
	}
	preview, err := PublicPreviewBySlug(context.Background(), app, share.Slug)
	if err != nil {
		t.Fatal(err)
	}

	if preview.Project.TaskCount != 2 || preview.Project.CompletedCount != 1 {
		t.Fatalf("archived tasks must stay out of the counts: %#v", preview.Project)
	}
	if preview.Project.Start != "2026-08-03" || preview.Project.End != "2026-09-12" {
		t.Fatalf("unexpected project span: %#v", preview.Project)
	}
	for _, task := range preview.Tasks {
		if task.Title == "Archived work" {
			t.Fatal("an archived task must not reach a public preview")
		}
	}
	if len(preview.States) != 2 || preview.States[0].TaskCount != 1 || preview.States[1].TaskCount != 1 {
		t.Fatalf("unexpected state counts: %#v", preview.States)
	}
	if len(preview.Members) != 2 || !preview.Members[0].Owner || preview.Members[0].Name != "Preview Owner" {
		t.Fatalf("the owner must lead the member list: %#v", preview.Members)
	}
	if preview.Members[1].Owner {
		t.Fatalf("only one member is the owner: %#v", preview.Members)
	}
}

func TestPublicPreviewOnlyLinksDocumentsTheAuthorShared(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	owner := createQueryTestUser(t, app, "docs-owner@example.com", "Docs Owner")
	project := createQueryTestProject(t, app, owner.Id, "Docs", false)
	state := createQueryTestState(t, app, project.Id)

	shared := createShareTestDoc(t, app, project.Id, owner.Id, "Shared doc")
	createShareTestDocShare(t, app, shared.Id, owner.Id, "aaaaaaaaaaaaaaaaaaaaaa", types.DateTime{})
	expired := createShareTestDoc(t, app, project.Id, owner.Id, "Expired doc")
	past, err := types.ParseDateTime(time.Now().Add(-time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	createShareTestDocShare(t, app, expired.Id, owner.Id, "bbbbbbbbbbbbbbbbbbbbbb", past)
	private := createShareTestDoc(t, app, project.Id, owner.Id, "Private doc")

	task := createQueryTestTask(t, app, project.Id, state.Id, owner.Id, nil)
	task.Set("documents", []string{shared.Id, expired.Id, private.Id})
	if err := app.Save(task); err != nil {
		t.Fatal(err)
	}

	share, err := Publish(context.Background(), app, owner.Id, project.Id, ShareInput{})
	if err != nil {
		t.Fatal(err)
	}
	preview, err := PublicPreviewBySlug(context.Background(), app, share.Slug)
	if err != nil {
		t.Fatal(err)
	}
	if len(preview.Tasks) != 1 || len(preview.Tasks[0].Documents) != 3 {
		t.Fatalf("every linked document should be listed by title: %#v", preview.Tasks)
	}
	documents := map[string]string{}
	for _, document := range preview.Tasks[0].Documents {
		documents[document.Title] = document.Slug
	}
	if documents["Shared doc"] != "aaaaaaaaaaaaaaaaaaaaaa" {
		t.Fatalf("a live public document must be openable: %#v", documents)
	}
	// An expired or never-shared document reveals a title and nothing that
	// could open it.
	if documents["Expired doc"] != "" || documents["Private doc"] != "" {
		t.Fatalf("unshared documents must not leak a slug: %#v", documents)
	}
}

func TestPublicPreviewStopsAtExpiryAndArchive(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	owner := createQueryTestUser(t, app, "expiry-owner@example.com", "Expiry Owner")
	project := createQueryTestProject(t, app, owner.Id, "Expiring", false)
	share, err := Publish(context.Background(), app, owner.Id, project.Id, ShareInput{})
	if err != nil {
		t.Fatal(err)
	}

	// Archiving the project takes the link down without touching the share.
	project.Set("archived", true)
	if err := app.Save(project); err != nil {
		t.Fatal(err)
	}
	if _, err := PublicPreviewBySlug(context.Background(), app, share.Slug); !errors.Is(err, ErrShareNotFound) {
		t.Fatalf("an archived project must not be previewable, got %v", err)
	}
	project.Set("archived", false)
	if err := app.Save(project); err != nil {
		t.Fatal(err)
	}

	record, err := app.FindFirstRecordByFilter(boardProjectSharesCollection, "slug = {:slug}", map[string]any{"slug": share.Slug})
	if err != nil {
		t.Fatal(err)
	}
	past, err := types.ParseDateTime(time.Now().Add(-time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	record.Set("expires", past)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	if _, err := PublicPreviewBySlug(context.Background(), app, share.Slug); !errors.Is(err, ErrShareNotFound) {
		t.Fatalf("an expired link must not resolve, got %v", err)
	}

	// An unknown slug is indistinguishable from an expired or revoked one.
	if _, err := PublicPreviewBySlug(context.Background(), app, "zzzzzzzzzzzzzzzzzzzzzz"); !errors.Is(err, ErrShareNotFound) {
		t.Fatalf("expected the same not-found error, got %v", err)
	}
}

func createShareTestState(t *testing.T, app core.App, projectID, name, category string, sortOrder float64) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId(boardProjectStatesCollection)
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Set("project", projectID)
	record.Set("name", name)
	record.Set("color", "#22c55e")
	record.Set("category", category)
	record.Set("sort_order", sortOrder)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func createShareTestDoc(t *testing.T, app core.App, projectID, ownerID, title string) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId(docsCollection)
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Set("title", title)
	record.Set("kind", "markdown")
	record.Set("content", "# "+title)
	record.Set("owner", ownerID)
	record.Set("project", projectID)
	record.Set("status", "draft")
	record.Set("revision", 1)
	record.Set("last_edited_by", ownerID)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func createShareTestDocShare(t *testing.T, app core.App, docID, ownerID, slug string, expires types.DateTime) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId(docSharesCollection)
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Set("doc", docID)
	record.Set("slug", slug)
	record.Set("revision", 1)
	record.Set("created_by", ownerID)
	if !expires.IsZero() {
		record.Set("expires", expires)
	}
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}
