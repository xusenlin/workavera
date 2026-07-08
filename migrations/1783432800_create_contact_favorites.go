package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const contactFavoritesCollection = "contact_favorites"

func init() {
	m.Register(createContactFavoritesCollection, dropContactFavoritesCollection)
}

func createContactFavoritesCollection(app core.App) error {
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}

	favorites := core.NewBaseCollection(contactFavoritesCollection)
	favorites.ListRule = types.Pointer(`@request.auth.id != "" && owner = @request.auth.id`)
	favorites.ViewRule = favorites.ListRule
	favorites.CreateRule = types.Pointer(`@request.auth.id != "" && @request.body.owner = @request.auth.id`)
	favorites.UpdateRule = nil
	favorites.DeleteRule = types.Pointer(`owner = @request.auth.id`)
	favorites.Fields.Add(
		&core.RelationField{Name: "owner", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.RelationField{Name: "contact", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	favorites.AddIndex("idx_contact_favorites_owner_contact", true, "owner, contact", "")

	return app.Save(favorites)
}

func dropContactFavoritesCollection(app core.App) error {
	favorites, err := app.FindCollectionByNameOrId(contactFavoritesCollection)
	if err != nil {
		return nil
	}
	return app.Delete(favorites)
}
