package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const readingItemsCollection = "reading_items"

func init() {
	m.Register(createReadingItemsCollection, dropReadingItemsCollection)
}

func createReadingItemsCollection(app core.App) error {
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}
	projects, err := app.FindCollectionByNameOrId(boardProjectsCollection)
	if err != nil {
		return err
	}

	items := core.NewBaseCollection(readingItemsCollection)
	items.ListRule = types.Pointer(`owner = @request.auth.id`)
	items.ViewRule = items.ListRule
	items.CreateRule = types.Pointer(`@request.auth.id != "" && @request.body.owner = @request.auth.id`)
	items.UpdateRule = types.Pointer(`owner = @request.auth.id && @request.body.owner:changed = false`)
	items.DeleteRule = types.Pointer(`owner = @request.auth.id`)
	items.Fields.Add(
		&core.RelationField{Name: "owner", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.RelationField{Name: "project", CollectionId: projects.Id, MaxSelect: 1},
		&core.TextField{Name: "url", Required: true, Max: 2048},
		&core.TextField{Name: "title", Required: true, Max: 240, Presentable: true},
		&core.TextField{Name: "description", Max: 4000},
		&core.JSONField{Name: "tags", MaxSize: 16 * 1024},
		&core.SelectField{Name: "status", Required: true, MaxSelect: 1, Values: []string{"unread", "read", "archived"}},
		&core.TextField{Name: "content_text", Max: 256 * 1024},
		&core.TextField{Name: "summary", Max: 64 * 1024},
		&core.JSONField{Name: "key_points", MaxSize: 64 * 1024},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	items.AddIndex("idx_reading_items_owner_updated", false, "owner, updated", "")
	items.AddIndex("idx_reading_items_owner_status", false, "owner, status", "")

	return app.Save(items)
}

func dropReadingItemsCollection(app core.App) error {
	collection, err := app.FindCollectionByNameOrId(readingItemsCollection)
	if err != nil {
		return err
	}
	return app.Delete(collection)
}
