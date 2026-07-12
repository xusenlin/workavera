package migrations

import (
	"encoding/json"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestConfigsMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	collection, err := app.FindCollectionByNameOrId(configsCollection)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := collection.Fields.GetByName("value").(*core.JSONField); !ok {
		t.Fatal("configs value must support arbitrary JSON values")
	}
	if collection.ListRule != nil || collection.ViewRule != nil || collection.CreateRule != nil || collection.UpdateRule != nil || collection.DeleteRule != nil {
		t.Fatal("configs must only be managed through trusted server or admin access")
	}
	record, err := app.FindFirstRecordByFilter(configsCollection, `key = "system.timezone"`)
	if err != nil {
		t.Fatal(err)
	}
	var timezone string
	if err := json.Unmarshal([]byte(record.GetString("value")), &timezone); err != nil || timezone != "Asia/Shanghai" {
		t.Fatalf("unexpected default timezone: %q (%v)", record.GetString("value"), err)
	}
	theme, err := app.FindFirstRecordByFilter(configsCollection, `key = "system.theme"`)
	if err != nil {
		t.Fatal(err)
	}
	var themeValue string
	if err := json.Unmarshal([]byte(theme.GetString("value")), &themeValue); err != nil || themeValue != "system" {
		t.Fatalf("unexpected default theme: %q (%v)", theme.GetString("value"), err)
	}
}
