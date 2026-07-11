package migrations

import (
	"fmt"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(
		func(app core.App) error {
			return setBoardTaskPriorities(app, []string{"none", "low", "medium", "high", "urgent"})
		},
		func(app core.App) error {
			return setBoardTaskPriorities(app, []string{"low", "medium", "high", "urgent"})
		},
	)
}

func setBoardTaskPriorities(app core.App, values []string) error {
	collection, err := app.FindCollectionByNameOrId(boardTasksCollection)
	if err != nil {
		return err
	}
	field, ok := collection.Fields.GetByName("priority").(*core.SelectField)
	if !ok {
		return fmt.Errorf("board_tasks.priority is not a select field")
	}
	field.Values = values
	return app.Save(collection)
}
