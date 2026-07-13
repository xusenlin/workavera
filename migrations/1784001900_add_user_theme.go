package migrations

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(addUserTheme, dropUserTheme)
}

// addUserTheme makes the appearance theme a per-user preference stored on the
// users record (readable/writable by the owner via the built-in records API),
// and removes the obsolete global system.theme config that made theme a
// shared, system-wide setting.
func addUserTheme(app core.App) error {
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}
	users.Fields.Add(&core.SelectField{
		Name:      "theme",
		MaxSelect: 1,
		Values:    []string{"system", "light", "dark"},
	})
	if err := app.Save(users); err != nil {
		return err
	}

	// Drop the shared theme config; timezone stays a system setting.
	if record, err := app.FindFirstRecordByFilter(configsCollection, "key = {:key}", dbx.Params{"key": "system.theme"}); err == nil {
		if err := app.Delete(record); err != nil {
			return err
		}
	}
	return nil
}

func dropUserTheme(app core.App) error {
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}
	users.Fields.RemoveByName("theme")
	if err := app.Save(users); err != nil {
		return err
	}

	if _, err := app.FindFirstRecordByFilter(configsCollection, "key = {:key}", dbx.Params{"key": "system.theme"}); err != nil {
		collection, err := app.FindCollectionByNameOrId(configsCollection)
		if err != nil {
			return err
		}
		record := core.NewRecord(collection)
		record.Set("key", "system.theme")
		record.Set("value", "system")
		record.Set("description", "Application theme: system, light, or dark.")
		if err := app.Save(record); err != nil {
			return err
		}
	}
	return nil
}
