package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(addDocKind, dropDocKind)
}

// addDocKind introduces document kinds: "markdown" documents keep the
// BlockNote editing flow, while "html" documents hold a self-contained HTML
// artifact rendered in a sandboxed preview (absorbing the former AI Micro
// Apps capability). The kind is fixed at creation and never changes, so
// versions of a document always share its kind.
func addDocKind(app core.App) error {
	docs, err := app.FindCollectionByNameOrId(docsCollection)
	if err != nil {
		return err
	}
	docs.Fields.Add(&core.SelectField{
		Name:      "kind",
		Required:  true,
		MaxSelect: 1,
		Values:    []string{"markdown", "html"},
	})
	if err := app.Save(docs); err != nil {
		return err
	}
	_, err = app.DB().NewQuery("UPDATE {{docs}} SET kind = 'markdown' WHERE kind = '' OR kind IS NULL").Execute()
	return err
}

func dropDocKind(app core.App) error {
	docs, err := app.FindCollectionByNameOrId(docsCollection)
	if err != nil {
		return err
	}
	docs.Fields.RemoveByName("kind")
	return app.Save(docs)
}
