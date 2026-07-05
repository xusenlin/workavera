package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const boardTaskOperationLogsCollection = "board_task_operation_logs"

func init() {
	m.Register(createBoardTaskOperationLogs, dropBoardTaskOperationLogs)
}

func createBoardTaskOperationLogs(app core.App) error {
	projects, err := app.FindCollectionByNameOrId(boardProjectsCollection)
	if err != nil {
		return err
	}
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}

	logs := core.NewBaseCollection(boardTaskOperationLogsCollection)
	readRule := `@request.auth.id != "" && (project.owner = @request.auth.id || project.board_project_members_via_project.user ?= @request.auth.id)`
	logs.ListRule = types.Pointer(readRule)
	logs.ViewRule = logs.ListRule
	logs.CreateRule = nil
	logs.UpdateRule = nil
	logs.DeleteRule = nil
	logs.Fields.Add(
		&core.RelationField{Name: "project", CollectionId: projects.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.TextField{Name: "task_id", Required: true, Max: 64},
		&core.TextField{Name: "task_title", Required: true, Max: 240, Presentable: true},
		&core.RelationField{Name: "actor", CollectionId: users.Id, MaxSelect: 1},
		&core.TextField{Name: "actor_name", Required: true, Max: 100},
		&core.SelectField{Name: "action", Required: true, MaxSelect: 1, Values: []string{"create", "update", "move", "delete"}},
		&core.JSONField{Name: "changes", MaxSize: 128 * 1024},
		&core.AutodateField{Name: "created", OnCreate: true},
	)
	logs.AddIndex("idx_board_task_logs_project_task_created", false, "project, task_id, created", "")

	return app.Save(logs)
}

func dropBoardTaskOperationLogs(app core.App) error {
	collection, err := app.FindCollectionByNameOrId(boardTaskOperationLogsCollection)
	if err != nil {
		return err
	}
	return app.Delete(collection)
}
