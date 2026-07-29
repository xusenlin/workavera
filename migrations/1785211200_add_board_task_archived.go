package migrations

import (
	"errors"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(addBoardTaskArchived, removeBoardTaskArchived)
}

func addBoardTaskArchived(app core.App) error {
	tasks, err := app.FindCollectionByNameOrId(boardTasksCollection)
	if err != nil {
		return err
	}
	tasks.Fields.Add(&core.BoolField{Name: "archived"})
	tasks.AddIndex(
		"idx_board_tasks_project_archived_state_rank",
		false,
		"project, archived, state, rank",
		"",
	)
	if err := app.Save(tasks); err != nil {
		return err
	}

	logs, err := app.FindCollectionByNameOrId(boardTaskOperationLogsCollection)
	if err != nil {
		return err
	}
	action, ok := logs.Fields.GetByName("action").(*core.SelectField)
	if !ok {
		return errors.New("board task operation log action field is not a select")
	}
	action.Values = append(action.Values, "archive", "restore")
	return app.Save(logs)
}

func removeBoardTaskArchived(app core.App) error {
	logs, err := app.FindCollectionByNameOrId(boardTaskOperationLogsCollection)
	if err != nil {
		return err
	}
	action, ok := logs.Fields.GetByName("action").(*core.SelectField)
	if !ok {
		return errors.New("board task operation log action field is not a select")
	}
	action.Values = []string{"create", "update", "move", "delete"}
	if err := app.Save(logs); err != nil {
		return err
	}

	tasks, err := app.FindCollectionByNameOrId(boardTasksCollection)
	if err != nil {
		return err
	}
	tasks.RemoveIndex("idx_board_tasks_project_archived_state_rank")
	tasks.Fields.RemoveByName("archived")
	return app.Save(tasks)
}
