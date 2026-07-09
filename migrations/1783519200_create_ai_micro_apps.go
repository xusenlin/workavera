package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const aiMicroAppsCollection = "ai_micro_apps"

func init() {
	m.Register(createAIMicroAppsCollection, dropAIMicroAppsCollection)
}

func createAIMicroAppsCollection(app core.App) error {
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}

	apps := core.NewBaseCollection(aiMicroAppsCollection)
	apps.Fields.Add(
		&core.TextField{Name: "name", Required: true, Max: 120, Presentable: true},
		&core.TextField{Name: "description", Max: 1000},
		&core.RelationField{Name: "owner", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.FileField{Name: "html_file", Required: true, MaxSelect: 1, MaxSize: 2 * 1024 * 1024, MimeTypes: []string{"text/html"}, Protected: true},
		&core.FileField{Name: "thumbnail", MaxSelect: 1, MaxSize: 2 * 1024 * 1024, MimeTypes: []string{"image/png", "image/jpeg", "image/webp"}, Thumbs: []string{"320x180", "640x360"}},
		&core.SelectField{Name: "status", Required: true, MaxSelect: 1, Values: []string{"draft", "published", "archived"}},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	apps.AddIndex("idx_ai_micro_apps_owner_updated", false, "owner, updated", "")
	apps.ListRule = types.Pointer(`@request.auth.id != "" && owner = @request.auth.id`)
	apps.ViewRule = apps.ListRule
	apps.CreateRule = types.Pointer(`@request.auth.id != ""`)
	apps.UpdateRule = types.Pointer(`owner = @request.auth.id && @request.body.owner:changed = false`)
	apps.DeleteRule = types.Pointer(`owner = @request.auth.id`)

	return app.Save(apps)
}

func dropAIMicroAppsCollection(app core.App) error {
	collection, err := app.FindCollectionByNameOrId(aiMicroAppsCollection)
	if err != nil {
		return err
	}
	return app.Delete(collection)
}
