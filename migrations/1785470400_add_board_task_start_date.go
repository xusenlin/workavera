package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(addBoardTaskStartDate, removeBoardTaskStartDate)
}

// addBoardTaskStartDate turns a task from a single deadline into a span. The
// field is optional, so existing tasks keep behaving exactly as before: a task
// without it still sits on its due date alone.
func addBoardTaskStartDate(app core.App) error {
	tasks, err := app.FindCollectionByNameOrId(boardTasksCollection)
	if err != nil {
		return err
	}
	tasks.Fields.Add(&core.DateField{Name: "start_date"})
	return app.Save(tasks)
}

func removeBoardTaskStartDate(app core.App) error {
	tasks, err := app.FindCollectionByNameOrId(boardTasksCollection)
	if err != nil {
		return err
	}
	tasks.Fields.RemoveByName("start_date")
	return app.Save(tasks)
}
