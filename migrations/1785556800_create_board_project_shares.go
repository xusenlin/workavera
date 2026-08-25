package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const boardProjectSharesCollection = "board_project_shares"

// createBoardProjectSharesCollection adds public project previews. Like
// doc_shares, a share lives in its own record so publishing, expiring and
// revoking never touch the project or its tasks. Unlike doc_shares it pins
// nothing: a public project preview reports the project as it stands right
// now, because the point of sharing a board is showing current progress.
func createBoardProjectSharesCollection(app core.App) error {
	projects, err := app.FindCollectionByNameOrId(boardProjectsCollection)
	if err != nil {
		return err
	}
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}

	shares := core.NewBaseCollection(boardProjectSharesCollection)
	// Owners read their own shares through the PocketBase API; every write
	// goes through /api/board/projects/{id}/share, which allocates the slug.
	// Anonymous visitors never touch this collection: they resolve a slug
	// through /api/public/board/{slug}.
	shareRead := `@request.auth.id != "" && project.owner = @request.auth.id`
	shares.ListRule = types.Pointer(shareRead)
	shares.ViewRule = types.Pointer(shareRead)
	shares.Fields.Add(
		&core.RelationField{Name: "project", CollectionId: projects.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.TextField{Name: "slug", Required: true, Min: 22, Max: 22, Pattern: "^[a-z0-9]{22}$"},
		&core.DateField{Name: "expires"},
		&core.RelationField{Name: "created_by", CollectionId: users.Id, MaxSelect: 1, Required: true},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	shares.AddIndex("idx_board_project_shares_project", true, "project", "")
	shares.AddIndex("idx_board_project_shares_slug", true, "slug", "")
	return app.Save(shares)
}

func dropBoardProjectSharesCollection(app core.App) error {
	collection, err := app.FindCollectionByNameOrId(boardProjectSharesCollection)
	if err != nil {
		return err
	}
	return app.Delete(collection)
}

func init() {
	m.Register(createBoardProjectSharesCollection, dropBoardProjectSharesCollection)
}
