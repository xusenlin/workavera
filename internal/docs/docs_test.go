package docs

import (
	"context"
	"encoding/base64"
	"encoding/json"
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
	otherProject := createTestProject(t, app, owner.Id)
	folder := createTestFolder(t, app, owner.Id, "Moved from project")
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
	if _, err := MoveToProject(context.Background(), app, member.Id, doc.ID, otherProject.Id); !errors.Is(err, ErrForbidden) {
		t.Fatalf("non-creator moved project document: %v", err)
	}
	moved, err = MoveToProject(context.Background(), app, owner.Id, doc.ID, otherProject.Id)
	if err != nil || moved.ProjectID != otherProject.Id || moved.Revision != 1 {
		t.Fatalf("move across projects: %#v, %v", moved, err)
	}
	if _, err := Get(context.Background(), app, member.Id, doc.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("former project member retained document access: %v", err)
	}
	moved, err = Move(context.Background(), app, owner.Id, doc.ID, MoveInput{Destination: "folder", DestinationID: folder.Id})
	if err != nil || moved.ProjectID != "" || moved.FolderID != folder.Id || moved.Revision != 1 {
		t.Fatalf("move project document to private folder: %#v, %v", moved, err)
	}
}

func TestMovingProjectDocumentUnlinksBoardTasks(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	owner := createTestUser(t, app, "move-linked-owner@example.com")
	project := createTestProject(t, app, owner.Id)
	target := createTestProject(t, app, owner.Id)
	doc, err := Create(context.Background(), app, owner.Id, CreateInput{Title: "Linked", ProjectID: project.Id})
	if err != nil {
		t.Fatal(err)
	}
	task := createTestTaskWithDocument(t, app, owner.Id, project.Id, doc.ID)

	moved, err := MoveToProject(context.Background(), app, owner.Id, doc.ID, target.Id)
	if err != nil || moved.ProjectID != target.Id {
		t.Fatalf("move linked document: %#v, %v", moved, err)
	}
	task, err = app.FindRecordById("board_tasks", task.Id)
	if err != nil {
		t.Fatal(err)
	}
	if got := task.GetStringSlice("documents"); len(got) != 0 {
		t.Fatalf("moving document must unlink source tasks, got %#v", got)
	}
}

func TestPersonalFoldersCreateSearchAndMoveWithoutRevision(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	owner := createTestUser(t, app, "folder-owner@example.com")
	other := createTestUser(t, app, "folder-other@example.com")
	folder := createTestFolder(t, app, owner.Id, "Plans")
	otherFolder := createTestFolder(t, app, other.Id, "Private")

	doc, err := Create(context.Background(), app, owner.Id, CreateInput{Title: "Roadmap", FolderID: folder.Id})
	if err != nil || doc.FolderID != folder.Id || doc.FolderName != "Plans" || doc.ProjectID != "" {
		t.Fatalf("create in folder: %#v, %v", doc, err)
	}
	if _, err := Create(context.Background(), app, owner.Id, CreateInput{Title: "Invalid", FolderID: otherFolder.Id}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("cross-owner folder accepted: %v", err)
	}
	project := createTestProject(t, app, owner.Id)
	if _, err := Create(context.Background(), app, owner.Id, CreateInput{Title: "Two locations", FolderID: folder.Id, ProjectID: project.Id}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("folder/project combination accepted: %v", err)
	}

	root, err := Create(context.Background(), app, owner.Id, CreateInput{Title: "Root"})
	if err != nil {
		t.Fatal(err)
	}
	folderResults, err := Search(context.Background(), app, owner.Id, SearchOptions{FolderID: folder.Id})
	if err != nil || len(folderResults) != 1 || folderResults[0].ID != doc.ID {
		t.Fatalf("folder search: %#v, %v", folderResults, err)
	}
	rootResults, err := Search(context.Background(), app, owner.Id, SearchOptions{RootOnly: true})
	if err != nil || len(rootResults) != 1 || rootResults[0].ID != root.ID {
		t.Fatalf("root search: %#v, %v", rootResults, err)
	}
	if _, err := Search(context.Background(), app, owner.Id, SearchOptions{FolderID: folder.Id, RootOnly: true}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("multiple location filters accepted: %v", err)
	}

	moved, err := Move(context.Background(), app, owner.Id, root.ID, MoveInput{Destination: "folder", DestinationID: folder.Id})
	if err != nil || moved.FolderID != folder.Id || moved.Revision != 1 {
		t.Fatalf("move to folder: %#v, %v", moved, err)
	}
	moved, err = Move(context.Background(), app, owner.Id, root.ID, MoveInput{Destination: "my_documents"})
	if err != nil || moved.FolderID != "" || moved.Revision != 1 {
		t.Fatalf("move to My documents: %#v, %v", moved, err)
	}
	if _, err := Move(context.Background(), app, owner.Id, root.ID, MoveInput{Destination: "folder", DestinationID: otherFolder.Id}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("cross-owner move accepted: %v", err)
	}

	folders, err := ListFolders(context.Background(), app, owner.Id)
	if err != nil || len(folders) != 1 || folders[0].ID != folder.Id {
		t.Fatalf("list folders: %#v, %v", folders, err)
	}
	moved, err = MoveToProject(context.Background(), app, owner.Id, doc.ID, project.Id)
	if err != nil || moved.ProjectID != project.Id || moved.FolderID != "" || moved.Revision != 1 {
		t.Fatalf("move folder document to project: %#v, %v", moved, err)
	}
	moved, err = Move(context.Background(), app, owner.Id, doc.ID, MoveInput{Destination: "my_documents"})
	if err != nil || moved.ProjectID != "" || moved.FolderID != "" || moved.Revision != 1 {
		t.Fatalf("move project document back to My documents: %#v, %v", moved, err)
	}
}

func TestPinsArePerUserAndLimitedToTen(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	actor := createTestUser(t, app, "pins-owner@example.com")
	for index := 0; index < 11; index++ {
		doc, err := Create(context.Background(), app, actor.Id, CreateInput{Title: fmt.Sprintf("Doc %d", index)})
		if err != nil {
			t.Fatal(err)
		}
		err = SetPinned(context.Background(), app, actor.Id, doc.ID, true)
		if index < 10 && err != nil {
			t.Fatalf("pin %d: %v", index, err)
		}
		if index == 10 && !errors.Is(err, ErrPinLimit) {
			t.Fatalf("expected pin limit, got %v", err)
		}
	}
	pinned, err := ListPinned(context.Background(), app, actor.Id, "")
	if err != nil || len(pinned) != 10 {
		t.Fatalf("unexpected pins: %#v, %v", pinned, err)
	}
}

func TestListPinnedSearchesContentWithoutReturningIt(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	actor := createTestUser(t, app, "pin-search@example.com")

	documents := []CreateInput{
		{Title: "Needle in title", Content: "ordinary"},
		{Title: "Content match", Content: "hidden needle text"},
		{Title: "Unrelated", Content: "ordinary"},
	}
	for _, input := range documents {
		doc, err := Create(context.Background(), app, actor.Id, input)
		if err != nil {
			t.Fatal(err)
		}
		if err := SetPinned(context.Background(), app, actor.Id, doc.ID, true); err != nil {
			t.Fatal(err)
		}
	}

	pinned, err := ListPinned(context.Background(), app, actor.Id, "needle")
	if err != nil || len(pinned) != 2 {
		t.Fatalf("unexpected filtered pins: %#v, %v", pinned, err)
	}
	payload, err := json.Marshal(pinned)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(payload), `"content"`) || strings.Contains(string(payload), "hidden needle text") {
		t.Fatalf("pinned summaries leaked content: %s", payload)
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

func TestCreateValidatesKindAndDefaultsToMarkdown(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	actor := createTestUser(t, app, "kind-owner@example.com")

	doc, err := Create(context.Background(), app, actor.Id, CreateInput{Title: "Notes", Content: "# hi"})
	if err != nil || doc.Kind != KindMarkdown {
		t.Fatalf("default kind must be markdown: %#v, %v", doc, err)
	}
	htmlDoc, err := Create(context.Background(), app, actor.Id, CreateInput{Title: "Widget", Kind: KindHTML, Content: "<!DOCTYPE html><html><body>hi</body></html>"})
	if err != nil || htmlDoc.Kind != KindHTML {
		t.Fatalf("html kind create: %#v, %v", htmlDoc, err)
	}
	if _, err := Create(context.Background(), app, actor.Id, CreateInput{Title: "Bad", Kind: "pdf"}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("unknown kind must be rejected, got %v", err)
	}
	if _, err := Create(context.Background(), app, actor.Id, CreateInput{Title: "Dev", Kind: KindHTML, Content: `<script src="http://localhost:5173/@vite/client"></script>`}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("dev-server HTML must be rejected, got %v", err)
	}
	// Content mutations validate against the stored kind, not caller input.
	if _, _, err := Update(context.Background(), app, actor.Id, htmlDoc.ID, UpdateInput{Title: "Widget", Content: `<a href="http://127.0.0.1:8090/x">x</a>`, BaseRevision: 1}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("html update must be validated, got %v", err)
	}
	if _, _, err := Update(context.Background(), app, actor.Id, doc.ID, UpdateInput{Title: "Notes", Content: "see http://localhost:8090 for dev", BaseRevision: 1}); err != nil {
		t.Fatalf("markdown content must stay unrestricted, got %v", err)
	}
}

func TestWriteChunkKeepsOneVersionPerSession(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	actor := createTestUser(t, app, "chunk-owner@example.com")
	doc, err := Create(context.Background(), app, actor.Id, CreateInput{Title: "App", Kind: KindHTML, Content: "<!DOCTYPE html>"})
	if err != nil {
		t.Fatal(err)
	}

	first, err := WriteChunk(context.Background(), app, actor.Id, WriteChunkInput{ID: doc.ID, Content: "<!DOCTYPE html><html><body>", Mode: "replace", BaseRevision: 1})
	if err != nil || first.Revision != 2 {
		t.Fatalf("replace chunk: %#v, %v", first, err)
	}
	second, err := WriteChunk(context.Background(), app, actor.Id, WriteChunkInput{ID: doc.ID, Content: "<h1>Hi</h1></body></html>", Mode: "append", BaseRevision: 2})
	if err != nil || second.Revision != 2 {
		t.Fatalf("append chunk must keep the revision: %#v, %v", second, err)
	}
	if second.Content != "<!DOCTYPE html><html><body><h1>Hi</h1></body></html>" {
		t.Fatalf("unexpected chunked content: %q", second.Content)
	}
	if _, err := WriteChunk(context.Background(), app, actor.Id, WriteChunkInput{ID: doc.ID, Content: "x", Mode: "append", BaseRevision: 1}); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale baseRevision must conflict, got %v", err)
	}

	// The whole chunked session leaves one version whose snapshot matches the
	// final content, so restore round-trips.
	versions, err := ListVersions(context.Background(), app, actor.Id, doc.ID)
	if err != nil || len(versions) != 2 {
		t.Fatalf("expected create + one chunk-session version, got %#v, %v", versions, err)
	}
	version, err := GetVersion(context.Background(), app, actor.Id, doc.ID, 2)
	if err != nil || version.Content != second.Content {
		t.Fatalf("version snapshot must match final content: %#v, %v", version, err)
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

func createTestFolder(t *testing.T, app core.App, ownerID, name string) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId(FoldersCollectionName)
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Set("name", name)
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

func createTestTaskWithDocument(t *testing.T, app core.App, ownerID, projectID, documentID string) *core.Record {
	t.Helper()
	states, err := app.FindCollectionByNameOrId("board_project_states")
	if err != nil {
		t.Fatal(err)
	}
	state := core.NewRecord(states)
	state.Set("project", projectID)
	state.Set("name", "Todo")
	state.Set("color", "#64748b")
	state.Set("category", "pending")
	state.Set("sort_order", 1000)
	if err := app.Save(state); err != nil {
		t.Fatal(err)
	}

	tasks, err := app.FindCollectionByNameOrId("board_tasks")
	if err != nil {
		t.Fatal(err)
	}
	task := core.NewRecord(tasks)
	task.Set("project", projectID)
	task.Set("state", state.Id)
	task.Set("title", "Linked task")
	task.Set("priority", "medium")
	task.Set("rank", 1000)
	task.Set("created_by", ownerID)
	task.Set("documents", []string{documentID})
	if err := app.Save(task); err != nil {
		t.Fatal(err)
	}
	return task
}
