package migrations

import (
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestBoardTaskArchivedMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	tasks, err := app.FindCollectionByNameOrId(boardTasksCollection)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := tasks.Fields.GetByName("archived").(*core.BoolField); !ok {
		t.Fatal("board_tasks must expose an archived boolean field")
	}
	foundArchivedIndex := false
	for _, index := range tasks.Indexes {
		if strings.Contains(index, "idx_board_tasks_project_archived_state_rank") {
			foundArchivedIndex = true
			break
		}
	}
	if !foundArchivedIndex {
		t.Fatalf("missing archived task listing index: %#v", tasks.Indexes)
	}
	logs, err := app.FindCollectionByNameOrId(boardTaskOperationLogsCollection)
	if err != nil {
		t.Fatal(err)
	}
	action, ok := logs.Fields.GetByName("action").(*core.SelectField)
	if !ok || !slices.Contains(action.Values, "archive") || !slices.Contains(action.Values, "restore") {
		t.Fatalf("task operation log actions must include archive and restore: %#v", action)
	}
}
