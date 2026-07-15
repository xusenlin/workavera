package docs

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	_ "github.com/xusenlin/workavera/migrations"
)

func TestExplicitSaveCreatesVersionsAndRejectsStaleRevision(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	actor := createTestUser(t, app, "docs-owner@example.com")

	doc, err := Create(context.Background(), app, actor.Id, CreateInput{Title: "Plan", Content: "first"})
	if err != nil || doc.Revision != 1 {
		t.Fatalf("create document: %#v, %v", doc, err)
	}
	updated, changed, err := Update(context.Background(), app, actor.Id, doc.ID, UpdateInput{Title: "Plan", Content: "second", BaseRevision: 1})
	if err != nil || !changed || updated.Revision != 2 {
		t.Fatalf("save document: %#v, %v, %v", updated, changed, err)
	}
	if _, _, err := Update(context.Background(), app, actor.Id, doc.ID, UpdateInput{Title: "Stale", Content: "lost", BaseRevision: 1}); !errors.Is(err, ErrConflict) {
		t.Fatalf("expected revision conflict, got %v", err)
	}
	unchanged, changed, err := Update(context.Background(), app, actor.Id, doc.ID, UpdateInput{Title: "Plan", Content: "second", BaseRevision: 2})
	if err != nil || changed || unchanged.Revision != 2 {
		t.Fatalf("unchanged save created a revision: %#v, %v, %v", unchanged, changed, err)
	}
	versions, err := ListVersions(context.Background(), app, actor.Id, doc.ID)
	if err != nil || len(versions) != 2 || versions[0].Revision != 2 || versions[1].Revision != 1 {
		t.Fatalf("unexpected versions: %#v, %v", versions, err)
	}
}

func TestRestoreCreatesNewRevision(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	actor := createTestUser(t, app, "restore-owner@example.com")
	doc, _ := Create(context.Background(), app, actor.Id, CreateInput{Title: "Original", Content: "one"})
	doc, _, _ = Update(context.Background(), app, actor.Id, doc.ID, UpdateInput{Title: "Changed", Content: "two", BaseRevision: 1})

	restored, err := Restore(context.Background(), app, actor.Id, doc.ID, 1, 2)
	if err != nil || restored.Revision != 3 || restored.Title != "Original" || restored.Content != "one" {
		t.Fatalf("restore: %#v, %v", restored, err)
	}
	version, err := GetVersion(context.Background(), app, actor.Id, doc.ID, 3)
	if err != nil || version.Source != "restore" {
		t.Fatalf("restore source: %#v, %v", version, err)
	}
}

func TestMovePrivateDocumentToProjectUsesProjectPermissions(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	owner := createTestUser(t, app, "move-owner@example.com")
	member := createTestUser(t, app, "move-member@example.com")
	viewer := createTestUser(t, app, "move-viewer@example.com")
	project := createTestProject(t, app, owner.Id)
	createTestMembership(t, app, project.Id, member.Id, "member")
	createTestMembership(t, app, project.Id, viewer.Id, "viewer")

	doc, _ := Create(context.Background(), app, owner.Id, CreateInput{Title: "Private"})
	if _, err := Get(context.Background(), app, member.Id, doc.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("member read private document: %v", err)
	}
	moved, err := MoveToProject(context.Background(), app, owner.Id, doc.ID, project.Id)
	if err != nil || moved.ProjectID != project.Id || moved.Revision != 1 {
		t.Fatalf("move: %#v, %v", moved, err)
	}
	if _, err := Get(context.Background(), app, member.Id, doc.ID); err != nil {
		t.Fatalf("member could not read project document: %v", err)
	}
	if _, _, err := Update(context.Background(), app, viewer.Id, doc.ID, UpdateInput{Title: "No", BaseRevision: 1}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("viewer edited project document: %v", err)
	}
	if _, err := MoveToProject(context.Background(), app, owner.Id, doc.ID, project.Id); !errors.Is(err, ErrForbidden) {
		t.Fatalf("project document moved twice: %v", err)
	}
	project.Set("owner", member.Id)
	if err := app.Save(project); err != nil {
		t.Fatal(err)
	}
	if _, err := Get(context.Background(), app, owner.Id, doc.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("former project participant retained document access: %v", err)
	}
}

func TestPinsArePerUserAndLimitedToSix(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	actor := createTestUser(t, app, "pins-owner@example.com")
	for index := 0; index < 7; index++ {
		doc, err := Create(context.Background(), app, actor.Id, CreateInput{Title: fmt.Sprintf("Doc %d", index)})
		if err != nil {
			t.Fatal(err)
		}
		err = SetPinned(context.Background(), app, actor.Id, doc.ID, true)
		if index < 6 && err != nil {
			t.Fatalf("pin %d: %v", index, err)
		}
		if index == 6 && !errors.Is(err, ErrPinLimit) {
			t.Fatalf("expected pin limit, got %v", err)
		}
	}
	pinned, err := ListPinned(context.Background(), app, actor.Id)
	if err != nil || len(pinned) != 6 {
		t.Fatalf("unexpected pins: %#v, %v", pinned, err)
	}
}

func TestArchiveAndDeleteRequireDocumentManager(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	owner := createTestUser(t, app, "manage-owner@example.com")
	member := createTestUser(t, app, "manage-member@example.com")
	project := createTestProject(t, app, owner.Id)
	createTestMembership(t, app, project.Id, member.Id, "member")
	doc, err := Create(context.Background(), app, member.Id, CreateInput{Title: "Managed", ProjectID: project.Id})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := SetArchived(context.Background(), app, owner.Id, doc.ID, true); !errors.Is(err, ErrForbidden) {
		t.Fatalf("project owner archived another user's document: %v", err)
	}
	archived, err := SetArchived(context.Background(), app, member.Id, doc.ID, true)
	if err != nil || archived.Status != "archived" || archived.Revision != 1 {
		t.Fatalf("archive: %#v, %v", archived, err)
	}
	if err := Delete(context.Background(), app, owner.Id, doc.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("project owner deleted another user's document: %v", err)
	}
	if err := Delete(context.Background(), app, member.Id, doc.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := app.FindRecordById(CollectionName, doc.ID); err == nil {
		t.Fatal("document was not deleted")
	}
}

func TestDocumentAssetUploadPermissionsValidationAndCascadeDelete(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	owner := createTestUser(t, app, "asset-owner@example.com")
	member := createTestUser(t, app, "asset-member@example.com")
	viewer := createTestUser(t, app, "asset-viewer@example.com")
	outsider := createTestUser(t, app, "asset-outsider@example.com")
	project := createTestProject(t, app, owner.Id)
	createTestMembership(t, app, project.Id, member.Id, "member")
	createTestMembership(t, app, project.Id, viewer.Id, "viewer")

	privateDoc, err := Create(context.Background(), app, owner.Id, CreateInput{Title: "Private asset"})
	if err != nil {
		t.Fatal(err)
	}
	asset, err := UploadAsset(context.Background(), app, owner.Id, privateDoc.ID, testPNG(t, "diagram.png"))
	if err != nil || asset.Kind != "image" || asset.Name != "diagram.png" || !strings.HasPrefix(asset.URL, "/api/files/doc_assets/") {
		t.Fatalf("upload private image: %#v, %v", asset, err)
	}
	if strings.Contains(asset.URL, "://") {
		t.Fatalf("asset URL must remain relative: %q", asset.URL)
	}
	if _, err := UploadAsset(context.Background(), app, outsider.Id, privateDoc.ID, testPNG(t, "diagram.png")); !errors.Is(err, ErrNotFound) {
		t.Fatalf("outsider uploaded private asset: %v", err)
	}
	if _, err := UploadAsset(context.Background(), app, owner.Id, privateDoc.ID, testFile(t, []byte("<html>unsafe</html>"), "unsafe.html")); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("HTML upload was accepted: %v", err)
	}
	oversized := testFile(t, []byte("plain text"), "large.txt")
	oversized.Size = maxAssetSize + 1
	if _, err := UploadAsset(context.Background(), app, owner.Id, privateDoc.ID, oversized); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("oversized upload was accepted: %v", err)
	}

	projectDoc, err := Create(context.Background(), app, owner.Id, CreateInput{Title: "Project asset", ProjectID: project.Id})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := UploadAsset(context.Background(), app, member.Id, projectDoc.ID, testFile(t, []byte("%PDF-1.4\n%%EOF"), "spec.pdf")); err != nil {
		t.Fatalf("member could not upload project asset: %v", err)
	}
	if _, err := UploadAsset(context.Background(), app, viewer.Id, projectDoc.ID, testFile(t, []byte("%PDF-1.4\n%%EOF"), "spec.pdf")); !errors.Is(err, ErrForbidden) {
		t.Fatalf("viewer uploaded project asset: %v", err)
	}
	if _, err := SetArchived(context.Background(), app, owner.Id, projectDoc.ID, true); err != nil {
		t.Fatal(err)
	}
	if _, err := UploadAsset(context.Background(), app, member.Id, projectDoc.ID, testPNG(t, "archived.png")); !errors.Is(err, ErrForbidden) {
		t.Fatalf("asset uploaded to archived document: %v", err)
	}

	if err := Delete(context.Background(), app, owner.Id, privateDoc.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := app.FindRecordById(AssetsCollectionName, asset.ID); err == nil {
		t.Fatal("document asset record survived document deletion")
	}
}

func TestDocumentAssetUploadDeduplicatesWithinDocument(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	owner := createTestUser(t, app, "dedupe-owner@example.com")
	member := createTestUser(t, app, "dedupe-member@example.com")
	project := createTestProject(t, app, owner.Id)
	createTestMembership(t, app, project.Id, member.Id, "member")

	doc, err := Create(context.Background(), app, owner.Id, CreateInput{Title: "Dedupe", ProjectID: project.Id})
	if err != nil {
		t.Fatal(err)
	}
	first, err := UploadAsset(context.Background(), app, owner.Id, doc.ID, testPNG(t, "diagram.png"))
	if err != nil {
		t.Fatal(err)
	}
	reused, err := UploadAsset(context.Background(), app, member.Id, doc.ID, testPNG(t, "diagram.png"))
	if err != nil {
		t.Fatal(err)
	}
	if reused.ID != first.ID || reused.URL != first.URL {
		t.Fatalf("duplicate upload did not reuse asset: first=%#v reused=%#v", first, reused)
	}

	stored, err := app.FindRecordById(AssetsCollectionName, first.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.GetString("uploaded_by") != owner.Id {
		t.Fatalf("duplicate upload changed original uploader: %q", stored.GetString("uploaded_by"))
	}
	if contentHash := stored.GetString("sha256"); len(contentHash) != 64 {
		t.Fatalf("unexpected stored content hash: %q", contentHash)
	}
	records, err := app.FindRecordsByFilter(AssetsCollectionName, "doc = {:doc}", "", 0, 0, dbx.Params{"doc": doc.ID})
	if err != nil || len(records) != 1 {
		t.Fatalf("duplicate upload created extra records: %d, %v", len(records), err)
	}

	renamed, err := UploadAsset(context.Background(), app, member.Id, doc.ID, testPNG(t, "renamed.png"))
	if err != nil {
		t.Fatal(err)
	}
	if renamed.ID == first.ID {
		t.Fatal("same content with a different name was incorrectly deduplicated")
	}

	otherDoc, err := Create(context.Background(), app, owner.Id, CreateInput{Title: "Other", ProjectID: project.Id})
	if err != nil {
		t.Fatal(err)
	}
	other, err := UploadAsset(context.Background(), app, member.Id, otherDoc.ID, testPNG(t, "diagram.png"))
	if err != nil {
		t.Fatal(err)
	}
	if other.ID == first.ID {
		t.Fatal("assets were deduplicated across documents")
	}
}

func testPNG(t *testing.T, name string) *filesystem.File {
	t.Helper()
	data, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	return testFile(t, data, name)
}

func testFile(t *testing.T, data []byte, name string) *filesystem.File {
	t.Helper()
	file, err := filesystem.NewFileFromBytes(data, name)
	if err != nil {
		t.Fatal(err)
	}
	return file
}

func createTestUser(t *testing.T, app core.App, email string) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.SetEmail(email)
	record.SetPassword("password123")
	record.Set("name", email)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func createTestProject(t *testing.T, app core.App, ownerID string) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("board_projects")
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Set("name", "Docs project")
	record.Set("owner", ownerID)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func createTestMembership(t *testing.T, app core.App, projectID, userID, role string) {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("board_project_members")
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Set("project", projectID)
	record.Set("user", userID)
	record.Set("role", role)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
}
