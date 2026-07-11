package migrations

import (
	"slices"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestBoardTaskPriorityIncludesNone(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	collection, err := app.FindCollectionByNameOrId(boardTasksCollection)
	if err != nil {
		t.Fatal(err)
	}
	field, ok := collection.Fields.GetByName("priority").(*core.SelectField)
	if !ok || !slices.Contains(field.Values, "none") {
		t.Fatalf("board_tasks.priority does not include none: %#v", field)
	}
}
