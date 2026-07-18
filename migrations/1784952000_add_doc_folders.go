package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const docFoldersCollection = "doc_folders"

func init() {
	m.Register(addDocFolders, removeDocFolders)
}

func addDocFolders(app core.App) error {
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}

	ownerRead := `@request.auth.id != "" && owner = @request.auth.id`
	folders := core.NewBaseCollection(docFoldersCollection)
	folders.ListRule = types.Pointer(ownerRead)
	folders.ViewRule = folders.ListRule
	folders.CreateRule = types.Pointer(`@request.auth.id != ""`)
	folders.UpdateRule = types.Pointer(ownerRead + ` && @request.body.owner:changed = false`)
	folders.DeleteRule = types.Pointer(ownerRead)
	folders.Fields.Add(
		&core.TextField{Name: "name", Required: true, Max: 80, Presentable: true},
		&core.RelationField{Name: "owner", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	folders.AddIndex("idx_doc_folders_owner_name", true, "owner, name COLLATE NOCASE", "")
	if err := app.Save(folders); err != nil {
		return err
	}

	docs, err := app.FindCollectionByNameOrId(docsCollection)
	if err != nil {
		return err
	}
	docs.Fields.Add(&core.RelationField{Name: "folder", CollectionId: folders.Id, MaxSelect: 1})
	docs.UpdateRule = types.Pointer(`@request.auth.id != "" && owner = @request.auth.id && project = "" && status = "draft" && @request.body.title:changed = false && @request.body.kind:changed = false && @request.body.content:changed = false && @request.body.owner:changed = false && @request.body.project:changed = false && @request.body.status:changed = false && @request.body.revision:changed = false && @request.body.last_edited_by:changed = false`)
	docs.AddIndex("idx_docs_folder_updated", false, "folder, updated", "")
	return app.Save(docs)
}

func removeDocFolders(app core.App) error {
	docs, err := app.FindCollectionByNameOrId(docsCollection)
	if err != nil {
		return err
	}
	docs.UpdateRule = nil
	docs.Fields.RemoveByName("folder")
	if err := app.Save(docs); err != nil {
		return err
	}

	folders, err := app.FindCollectionByNameOrId(docFoldersCollection)
	if err != nil {
		return err
	}
	return app.Delete(folders)
}
