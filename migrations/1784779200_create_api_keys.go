package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const apiKeysCollection = "api_keys"

func init() {
	m.Register(createAPIKeysCollection, dropAPIKeysCollection)
}

func createAPIKeysCollection(app core.App) error {
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}

	keys := core.NewBaseCollection(apiKeysCollection)
	ownerRule := "user = @request.auth.id"
	keys.ListRule = types.Pointer(ownerRule)
	keys.ViewRule = types.Pointer(ownerRule)
	keys.DeleteRule = types.Pointer(ownerRule)
	keys.Fields.Add(
		&core.RelationField{Name: "user", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.TextField{Name: "name", Required: true, Max: 100, Presentable: true},
		&core.TextField{Name: "prefix", Required: true, Max: 20},
		&core.TextField{Name: "key_hash", Required: true, Hidden: true, Min: 64, Max: 64, Pattern: "^[a-f0-9]{64}$"},
		&core.BoolField{Name: "allow_destructive"},
		&core.DateField{Name: "expires"},
		&core.DateField{Name: "last_used"},
		&core.AutodateField{Name: "created", OnCreate: true},
	)
	keys.AddIndex("idx_api_keys_key_hash", true, "key_hash", "")
	keys.AddIndex("idx_api_keys_user_created", false, "user, created", "")
	return app.Save(keys)
}

func dropAPIKeysCollection(app core.App) error {
	collection, err := app.FindCollectionByNameOrId(apiKeysCollection)
	if err != nil {
		return err
	}
	return app.Delete(collection)
}
