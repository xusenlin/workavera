package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const docAssetsCollection = "doc_assets"

const docAssetMaxSize = 10 * 1024 * 1024

var docAssetMimeTypes = []string{
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
	"application/pdf",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.ms-powerpoint",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"text/plain",
	"text/markdown",
	"text/csv",
	"application/json",
	"application/zip",
}

func init() {
	m.Register(createDocAssetsCollection, dropDocAssetsCollection)
}

func createDocAssetsCollection(app core.App) error {
	docs, err := app.FindCollectionByNameOrId(docsCollection)
	if err != nil {
		return err
	}
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}

	assets := core.NewBaseCollection(docAssetsCollection)
	assetRead := `@request.auth.id != "" && ((doc.project = "" && doc.owner = @request.auth.id) || doc.project.owner = @request.auth.id || doc.project.board_project_members_via_project.user ?= @request.auth.id)`
	assets.ListRule = types.Pointer(assetRead)
	assets.ViewRule = assets.ListRule
	assets.Fields.Add(
		&core.RelationField{Name: "doc", CollectionId: docs.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.FileField{Name: "file", MaxSelect: 1, Required: true, MaxSize: docAssetMaxSize, MimeTypes: docAssetMimeTypes, Protected: true},
		&core.SelectField{Name: "kind", Required: true, MaxSelect: 1, Values: []string{"image", "file"}},
		&core.TextField{Name: "original_name", Required: true, Max: 255, Presentable: true},
		&core.TextField{Name: "media_type", Required: true, Max: 127},
		&core.NumberField{Name: "size", Required: true, Min: types.Pointer(0.0)},
		&core.TextField{Name: "sha256", Required: true, Hidden: true, Min: 64, Max: 64, Pattern: "^[a-f0-9]{64}$"},
		&core.RelationField{Name: "uploaded_by", CollectionId: users.Id, MaxSelect: 1, Required: true},
		&core.AutodateField{Name: "created", OnCreate: true},
	)
	assets.AddIndex("idx_doc_assets_doc_created", false, "doc, created", "")
	assets.AddIndex("idx_doc_assets_doc_sha256_name", true, "doc, sha256, original_name", "")
	return app.Save(assets)
}

func dropDocAssetsCollection(app core.App) error {
	collection, err := app.FindCollectionByNameOrId(docAssetsCollection)
	if err != nil {
		return err
	}
	return app.Delete(collection)
}
