package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestBoardTaskOperationLogsMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	logs, err := app.FindCollectionByNameOrId(boardTaskOperationLogsCollection)
	if err != nil {
		t.Fatal(err)
	}
	if logs.CreateRule != nil || logs.UpdateRule != nil || logs.DeleteRule != nil {
		t.Fatal("operation logs must be read-only through the records API")
	}
	if logs.ListRule == nil || logs.ViewRule == nil {
		t.Fatal("operation logs must be readable by project members")
	}
	project, ok := logs.Fields.GetByName("project").(*core.RelationField)
	if !ok || !project.Required || !project.CascadeDelete {
		t.Fatalf("unexpected project field: %#v", project)
	}
	action, ok := logs.Fields.GetByName("action").(*core.SelectField)
	if !ok || len(action.Values) != 4 {
		t.Fatalf("unexpected action field: %#v", action)
	}
}
