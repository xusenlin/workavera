package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	usersCollectionName = "users"
	avatarMaxSize       = 500 * 1024
)

var avatarMimeTypes = []string{
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
	"image/svg+xml",
}

func init() {
	m.Register(expandUsersProfile, rollbackUsersProfile)
}

func expandUsersProfile(app core.App) error {
	collection, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}

	authenticatedRule := `@request.auth.id != ""`
	ownerRule := "id = @request.auth.id"
	collection.ListRule = types.Pointer(authenticatedRule)
	collection.ViewRule = types.Pointer(authenticatedRule)
	collection.CreateRule = nil
	collection.UpdateRule = types.Pointer(ownerRule)
	collection.DeleteRule = types.Pointer(ownerRule)

	collection.Fields.Add(
		&core.TextField{
			Name:        "name",
			Max:         100,
			Required:    true,
			Presentable: true,
		},
		&core.FileField{
			Name:      "avatar",
			MaxSelect: 1,
			MaxSize:   avatarMaxSize,
			MimeTypes: avatarMimeTypes,
		},
		&core.TextField{
			Name: "phone",
			Max:  32,
		},
		&core.TextField{
			Name: "title",
			Max:  120,
		},
		&core.TextField{
			Name: "bio",
			Max:  1000,
		},
		&core.SelectField{
			Name:      "status",
			MaxSelect: 1,
			Values:    []string{"online", "away", "busy", "offline"},
		},
	)

	return app.Save(collection)
}

func rollbackUsersProfile(app core.App) error {
	collection, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}

	ownerRule := "id = @request.auth.id"
	collection.ListRule = types.Pointer(ownerRule)
	collection.ViewRule = types.Pointer(ownerRule)
	collection.CreateRule = types.Pointer("")
	collection.UpdateRule = types.Pointer(ownerRule)
	collection.DeleteRule = types.Pointer(ownerRule)

	collection.Fields.Add(
		&core.TextField{
			Name: "name",
			Max:  255,
		},
		&core.FileField{
			Name:      "avatar",
			MaxSelect: 1,
			MimeTypes: avatarMimeTypes,
		},
	)
	collection.Fields.RemoveByName("phone")
	collection.Fields.RemoveByName("title")
	collection.Fields.RemoveByName("bio")
	collection.Fields.RemoveByName("status")

	return app.Save(collection)
}
