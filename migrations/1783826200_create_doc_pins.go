package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const docPinsCollection = "doc_pins"

func init() {
	m.Register(createDocPinsCollection, dropDocPinsCollection)
}

func createDocPinsCollection(app core.App) error {
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}
	docs, err := app.FindCollectionByNameOrId(docsCollection)
	if err != nil {
		return err
	}
	pins := core.NewBaseCollection(docPinsCollection)
	pins.Fields.Add(
		&core.RelationField{Name: "user", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.RelationField{Name: "doc", CollectionId: docs.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.AutodateField{Name: "created", OnCreate: true},
	)
	pins.AddIndex("idx_doc_pins_user_doc", true, "user, doc", "")
	pins.AddIndex("idx_doc_pins_user_created", false, "user, created", "")
	return app.Save(pins)
}

func dropDocPinsCollection(app core.App) error {
	collection, err := app.FindCollectionByNameOrId(docPinsCollection)
	if err != nil {
		return err
	}
	return app.Delete(collection)
}
