package migrations

import (
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestDocFoldersMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	folders, err := app.FindCollectionByNameOrId(docFoldersCollection)
	if err != nil {
		t.Fatal(err)
	}
	if folders.ListRule == nil || folders.ViewRule == nil || *folders.ListRule != *folders.ViewRule {
		t.Fatal("doc folders must only be readable by their owner")
	}
	if folders.CreateRule == nil || folders.UpdateRule == nil || folders.DeleteRule == nil {
		t.Fatal("doc folders must use PocketBase CRUD rules")
	}
	name, ok := folders.Fields.GetByName("name").(*core.TextField)
	if !ok || !name.Required || name.Max != 80 {
		t.Fatalf("unexpected doc folder name field: %#v", name)
	}
	owner, ok := folders.Fields.GetByName("owner").(*core.RelationField)
	if !ok || !owner.Required || !owner.CascadeDelete {
		t.Fatalf("unexpected doc folder owner field: %#v", owner)
	}
	foundUniqueName := false
	for _, index := range folders.Indexes {
		if strings.Contains(index, "idx_doc_folders_owner_name") && strings.Contains(index, "COLLATE NOCASE") {
			foundUniqueName = true
		}
	}
	if !foundUniqueName {
		t.Fatalf("missing case-insensitive owner/name index: %#v", folders.Indexes)
	}

	docs, err := app.FindCollectionByNameOrId(docsCollection)
	if err != nil {
		t.Fatal(err)
	}
	folder, ok := docs.Fields.GetByName("folder").(*core.RelationField)
	if !ok || folder.Required || folder.CascadeDelete || folder.CollectionId != folders.Id {
		t.Fatalf("unexpected docs folder field: %#v", folder)
	}
	if docs.UpdateRule == nil || !strings.Contains(*docs.UpdateRule, `@request.body.content:changed = false`) {
		t.Fatalf("docs update rule must only allow folder moves: %v", docs.UpdateRule)
	}
}
