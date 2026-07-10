package migrations

import (
	"slices"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestBoardProjectOperationLogsMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	logs, err := app.FindCollectionByNameOrId(boardProjectOperationLogsCollection)
	if err != nil {
		t.Fatal(err)
	}
	if logs.CreateRule != nil || logs.UpdateRule != nil || logs.DeleteRule != nil {
		t.Fatal("project operation logs must only be written by server code")
	}
	for _, field := range []string{"project", "actor", "actor_name", "action", "changes", "created"} {
		if logs.Fields.GetByName(field) == nil {
			t.Fatalf("missing project operation log field %s", field)
		}
	}
	action, ok := logs.Fields.GetByName("action").(*core.SelectField)
	expectedActions := []string{
		"transfer_owner",
		"update_project",
		"create_state",
		"update_state",
		"delete_state",
		"create_label",
		"update_label",
		"delete_label",
		"add_member",
		"update_member",
		"remove_member",
	}
	if !ok || !slices.Equal(action.Values, expectedActions) {
		t.Fatalf("unexpected project operation actions: %#v", action)
	}
}
