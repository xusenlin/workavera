package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestAddBoardTaskDocumentsMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	tasks, err := app.FindCollectionByNameOrId(boardTasksCollection)
	if err != nil {
		t.Fatal(err)
	}
	field, ok := tasks.Fields.GetByName("documents").(*core.RelationField)
	if !ok {
		t.Fatal("board_tasks must expose a documents relation field")
	}
	if field.MaxSelect != 20 {
		t.Fatalf("documents must allow up to 20 links, got MaxSelect=%d", field.MaxSelect)
	}
	docs, err := app.FindCollectionByNameOrId(docsCollection)
	if err != nil {
		t.Fatal(err)
	}
	if field.CollectionId != docs.Id {
		t.Fatalf("documents must relate to the docs collection, got %q", field.CollectionId)
	}
	if field.CascadeDelete {
		t.Fatal("documents must not cascade delete the task when a doc is removed")
	}
}
