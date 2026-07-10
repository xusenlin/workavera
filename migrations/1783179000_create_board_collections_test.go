package migrations

import (
	"slices"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestBoardCollectionsMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	for _, name := range []string{
		boardTemplatesCollection,
		boardProjectsCollection,
		boardProjectStatesCollection,
		boardProjectMembersCollection,
		boardProjectLabelsCollection,
		boardTasksCollection,
	} {
		if _, err := app.FindCollectionByNameOrId(name); err != nil {
			t.Fatalf("missing collection %s: %v", name, err)
		}
	}

	templates, err := app.FindRecordsByFilter(boardTemplatesCollection, "", "name", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(templates) != len(boardTemplateSeeds) {
		t.Fatalf("expected %d templates, got %d", len(boardTemplateSeeds), len(templates))
	}
	for _, name := range []string{
		"Software Development", "软件开发",
		"Simple Kanban", "简易看板",
		"Content Production", "内容生产",
		"Issue Tracking", "问题跟踪",
		"Self-Media Operations", "自媒体运营",
	} {
		template, err := app.FindFirstRecordByFilter(
			boardTemplatesCollection,
			"name = {:name}",
			dbx.Params{"name": name},
		)
		if err != nil || template.GetString("description") == "" {
			t.Fatalf("missing bilingual template %q: %#v, %v", name, template, err)
		}
	}

	tasks, err := app.FindCollectionByNameOrId(boardTasksCollection)
	if err != nil {
		t.Fatal(err)
	}
	state, ok := tasks.Fields.GetByName("state").(*core.RelationField)
	if !ok || !state.Required {
		t.Fatalf("task state must be a required relation: %#v", state)
	}
	projects, err := app.FindCollectionByNameOrId(boardProjectsCollection)
	if err != nil {
		t.Fatal(err)
	}
	if projects.Fields.GetByName("created") == nil || projects.Fields.GetByName("updated") == nil {
		t.Fatal("board collections must expose created and updated timestamps")
	}
	members, err := app.FindCollectionByNameOrId(boardProjectMembersCollection)
	if err != nil {
		t.Fatal(err)
	}
	role, ok := members.Fields.GetByName("role").(*core.SelectField)
	if !ok || !slices.Equal(role.Values, []string{"admin", "member", "viewer"}) {
		t.Fatalf("unexpected member roles: %#v", role)
	}

	if err := dropReadingItemsCollection(app); err != nil {
		t.Fatalf("drop reading items: %v", err)
	}
	if err := dropBoardProjectOperationLogs(app); err != nil {
		t.Fatalf("drop project operation logs: %v", err)
	}
	if err := dropBoardTaskOperationLogs(app); err != nil {
		t.Fatalf("drop task operation logs: %v", err)
	}
	if err := dropBoardCollections(app); err != nil {
		t.Fatalf("drop board collections: %v", err)
	}
	if _, err := app.FindCollectionByNameOrId(boardProjectsCollection); err == nil {
		t.Fatal("expected board collections to be removed")
	}
}
