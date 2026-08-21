package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const docSharesCollection = "doc_shares"

func init() {
	m.Register(createDocSharesCollection, dropDocSharesCollection)
}

// createDocSharesCollection adds public document sharing. A share lives in its
// own record so creating, expiring, and revoking one never touches the
// document and never creates a revision. It pins the published revision
// instead of following the document, so the public link keeps serving that
// snapshot while editing continues.
func createDocSharesCollection(app core.App) error {
	docs, err := app.FindCollectionByNameOrId(docsCollection)
	if err != nil {
		return err
	}
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}

	shares := core.NewBaseCollection(docSharesCollection)
	// Owners read their own shares through the PocketBase API; every write
	// goes through /api/docs/{id}/share, which allocates the slug and pins the
	// revision. Anonymous readers never touch this collection: they resolve a
	// slug through /api/public/docs/{slug}.
	shareRead := `@request.auth.id != "" && doc.owner = @request.auth.id`
	shares.ListRule = types.Pointer(shareRead)
	shares.ViewRule = types.Pointer(shareRead)
	shares.Fields.Add(
		&core.RelationField{Name: "doc", CollectionId: docs.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.TextField{Name: "slug", Required: true, Min: 22, Max: 22, Pattern: "^[a-z0-9]{22}$"},
		&core.NumberField{Name: "revision", Required: true, Min: types.Pointer(1.0)},
		&core.DateField{Name: "expires"},
		&core.RelationField{Name: "created_by", CollectionId: users.Id, MaxSelect: 1, Required: true},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	shares.AddIndex("idx_doc_shares_doc", true, "doc", "")
	shares.AddIndex("idx_doc_shares_slug", true, "slug", "")
	return app.Save(shares)
}

func dropDocSharesCollection(app core.App) error {
	collection, err := app.FindCollectionByNameOrId(docSharesCollection)
	if err != nil {
		return err
	}
	return app.Delete(collection)
}
