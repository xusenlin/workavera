package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestAddUserThemeMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	preferences, err := app.FindCollectionByNameOrId(userPreferencesCollection)
	if err != nil {
		t.Fatal(err)
	}
	field, ok := preferences.Fields.GetByName("theme").(*core.SelectField)
	if !ok {
		t.Fatal("user preferences must expose a theme field")
	}
	if field.MaxSelect != 1 {
		t.Fatalf("theme must be single-select, got MaxSelect=%d", field.MaxSelect)
	}
	want := map[string]bool{"system": true, "light": true, "dark": true}
	if len(field.Values) != len(want) {
		t.Fatalf("unexpected theme values: %v", field.Values)
	}
	for _, value := range field.Values {
		if !want[value] {
			t.Fatalf("unexpected theme value %q", value)
		}
	}

	// The obsolete shared theme config must be gone; timezone stays.
	if _, err := app.FindFirstRecordByFilter(configsCollection, `key = "system.theme"`); err == nil {
		t.Fatal("system.theme config should have been removed")
	}
	if _, err := app.FindFirstRecordByFilter(configsCollection, `key = "system.timezone"`); err != nil {
		t.Fatal("system.timezone config must remain")
	}
}
