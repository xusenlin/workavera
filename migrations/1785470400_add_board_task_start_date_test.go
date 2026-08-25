package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestBoardTaskStartDateMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	tasks, err := app.FindCollectionByNameOrId(boardTasksCollection)
	if err != nil {
		t.Fatal(err)
	}
	startDate, ok := tasks.Fields.GetByName("start_date").(*core.DateField)
	if !ok {
		t.Fatal("board_tasks must expose a start_date date field")
	}
	// Tasks that only carry a deadline stay valid, so the field cannot be
	// required.
	if startDate.Required {
		t.Fatalf("unexpected board task start_date field: %#v", startDate)
	}
}
