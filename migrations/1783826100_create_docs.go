package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	docsCollection        = "docs"
	docVersionsCollection = "doc_versions"
)

func init() {
	m.Register(createDocsCollections, dropDocsCollections)
}

func createDocsCollections(app core.App) error {
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}
	projects, err := app.FindCollectionByNameOrId(boardProjectsCollection)
	if err != nil {
		return err
	}

	docs := core.NewBaseCollection(docsCollection)
	docRead := `@request.auth.id != "" && ((project = "" && owner = @request.auth.id) || project.owner = @request.auth.id || project.board_project_members_via_project.user ?= @request.auth.id)`
	docs.ListRule = types.Pointer(docRead)
	docs.ViewRule = docs.ListRule
	docs.Fields.Add(
		&core.TextField{Name: "title", Required: true, Max: 240, Presentable: true},
		&core.TextField{Name: "content", Max: 1024 * 1024},
		&core.RelationField{Name: "owner", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.RelationField{Name: "project", CollectionId: projects.Id, MaxSelect: 1},
		&core.SelectField{Name: "status", Required: true, MaxSelect: 1, Values: []string{"draft", "archived"}},
		&core.NumberField{Name: "revision", Required: true, Min: types.Pointer(1.0)},
		&core.RelationField{Name: "last_edited_by", CollectionId: users.Id, MaxSelect: 1, Required: true},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	docs.AddIndex("idx_docs_owner_updated", false, "owner, updated", "")
	docs.AddIndex("idx_docs_project_updated", false, "project, updated", "")
	docs.AddIndex("idx_docs_status_updated", false, "status, updated", "")
	if err := app.Save(docs); err != nil {
		return err
	}

	versions := core.NewBaseCollection(docVersionsCollection)
	versionRead := `@request.auth.id != "" && ((doc.project = "" && doc.owner = @request.auth.id) || doc.project.owner = @request.auth.id || doc.project.board_project_members_via_project.user ?= @request.auth.id)`
	versions.ListRule = types.Pointer(versionRead)
	versions.ViewRule = versions.ListRule
	versions.Fields.Add(
		&core.RelationField{Name: "doc", CollectionId: docs.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.NumberField{Name: "revision", Required: true, Min: types.Pointer(1.0)},
		&core.TextField{Name: "title", Required: true, Max: 240},
		&core.TextField{Name: "content", Max: 1024 * 1024},
		&core.RelationField{Name: "created_by", CollectionId: users.Id, MaxSelect: 1, Required: true},
		&core.SelectField{Name: "source", Required: true, MaxSelect: 1, Values: []string{"user", "ai", "restore"}},
		&core.AutodateField{Name: "created", OnCreate: true},
	)
	versions.AddIndex("idx_doc_versions_doc_revision", true, "doc, revision", "")
	versions.AddIndex("idx_doc_versions_doc_created", false, "doc, created", "")
	return app.Save(versions)
}

func dropDocsCollections(app core.App) error {
	if pins, err := app.FindCollectionByNameOrId(docPinsCollection); err == nil {
		if err := app.Delete(pins); err != nil {
			return err
		}
	}
	for _, name := range []string{docVersionsCollection, docsCollection} {
		collection, err := app.FindCollectionByNameOrId(name)
		if err != nil {
			return err
		}
		if err := app.Delete(collection); err != nil {
			return err
		}
	}
	return nil
}
