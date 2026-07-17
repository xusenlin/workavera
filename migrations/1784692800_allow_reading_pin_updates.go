package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const readingItemsOwnerUpdateRule = `owner = @request.auth.id && @request.body.owner:changed = false`

func init() {
	m.Register(allowReadingPinUpdates, restrictReadingPinUpdates)
}

func allowReadingPinUpdates(app core.App) error {
	items, err := app.FindCollectionByNameOrId(readingItemsCollection)
	if err != nil {
		return err
	}
	items.UpdateRule = types.Pointer(readingItemsOwnerUpdateRule)
	return app.Save(items)
}

func restrictReadingPinUpdates(app core.App) error {
	items, err := app.FindCollectionByNameOrId(readingItemsCollection)
	if err != nil {
		return err
	}
	items.UpdateRule = types.Pointer(`owner = @request.auth.id && @request.body.owner:changed = false && (@request.body.pinned:changed = false || @request.body.pinned = false)`)
	return app.Save(items)
}
