package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(addLLMModelSharedFrom, dropLLMModelSharedFrom)
}

// addLLMModelSharedFrom records the author a configuration was shared from.
// An empty value means the configuration was created by its owner (and may be
// shared onward); a non-empty value marks it as a received copy that only the
// original author can share. Existing rows default to empty (owner-created).
func addLLMModelSharedFrom(app core.App) error {
	collection, err := app.FindCollectionByNameOrId(llmModelsCollection)
	if err != nil {
		return err
	}
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}
	collection.Fields.Add(&core.RelationField{
		Name:         "shared_from",
		CollectionId: users.Id,
		MaxSelect:    1,
		// Keep the recipient's copy even if the original author is deleted.
		CascadeDelete: false,
	})
	return app.Save(collection)
}

func dropLLMModelSharedFrom(app core.App) error {
	collection, err := app.FindCollectionByNameOrId(llmModelsCollection)
	if err != nil {
		return err
	}
	collection.Fields.RemoveByName("shared_from")
	return app.Save(collection)
}
