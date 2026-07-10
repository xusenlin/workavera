package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const boardProjectOperationLogsCollection = "board_project_operation_logs"

func init() {
	m.Register(createBoardProjectOperationLogs, dropBoardProjectOperationLogs)
}

func createBoardProjectOperationLogs(app core.App) error {
	projects, err := app.FindCollectionByNameOrId(boardProjectsCollection)
	if err != nil {
		return err
	}
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}

	logs := core.NewBaseCollection(boardProjectOperationLogsCollection)
	readRule := `@request.auth.id != "" && (project.owner = @request.auth.id || project.board_project_members_via_project.user ?= @request.auth.id)`
	logs.ListRule = types.Pointer(readRule)
	logs.ViewRule = logs.ListRule
	logs.CreateRule = nil
	logs.UpdateRule = nil
	logs.DeleteRule = nil
	logs.Fields.Add(
		&core.RelationField{Name: "project", CollectionId: projects.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.RelationField{Name: "actor", CollectionId: users.Id, MaxSelect: 1},
		&core.TextField{Name: "actor_name", Required: true, Max: 100},
		&core.SelectField{Name: "action", Required: true, MaxSelect: 1, Values: []string{
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
		}},
		&core.JSONField{Name: "changes", MaxSize: 32 * 1024},
		&core.AutodateField{Name: "created", OnCreate: true},
	)
	logs.AddIndex("idx_board_project_logs_project_created", false, "project, created", "")

	return app.Save(logs)
}

func dropBoardProjectOperationLogs(app core.App) error {
	collection, err := app.FindCollectionByNameOrId(boardProjectOperationLogsCollection)
	if err != nil {
		return err
	}
	return app.Delete(collection)
}
