package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(addBoardTaskDocuments, dropBoardTaskDocuments)
}

// addBoardTaskDocuments lets a board task link one or more documents from the
// same project. The relation has no CascadeDelete, matching assignees/labels:
// deleting a document does not delete the task.
func addBoardTaskDocuments(app core.App) error {
	tasks, err := app.FindCollectionByNameOrId(boardTasksCollection)
	if err != nil {
		return err
	}
	docs, err := app.FindCollectionByNameOrId(docsCollection)
	if err != nil {
		return err
	}
	tasks.Fields.Add(&core.RelationField{
		Name:         "documents",
		CollectionId: docs.Id,
		MaxSelect:    20,
	})
	return app.Save(tasks)
}

func dropBoardTaskDocuments(app core.App) error {
	tasks, err := app.FindCollectionByNameOrId(boardTasksCollection)
	if err != nil {
		return err
	}
	tasks.Fields.RemoveByName("documents")
	return app.Save(tasks)
}
