package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestWidenResourcesMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	if err := restoreResourceConversion(app); err != nil {
		t.Fatal(err)
	}
	resources, err := app.FindCollectionByNameOrId(userResourcesCollection)
	if err != nil {
		t.Fatal(err)
	}
	if file, ok := resources.Fields.GetByName("file").(*core.FileField); !ok || file.MaxSize != resourceFileSizeCeiling {
		t.Fatalf("the file field must allow the size ceiling: %#v", file)
	}
	reason, ok := resources.Fields.GetByName("no_text_reason").(*core.SelectField)
	if !ok || reason.Required || len(reason.Values) != 5 {
		t.Fatalf("unexpected no_text_reason field: %#v", reason)
	}
	record, err := app.FindFirstRecordByFilter(configsCollection, `key = "resources.max_file_size_mb"`)
	if err != nil || record.GetString("value") != "10" || record.GetString("description") == "" {
		t.Fatalf("missing resources.max_file_size_mb default: %v %v", record, err)
	}

	if err := narrowResources(app); err != nil {
		t.Fatalf("narrow resources: %v", err)
	}
	resources, err = app.FindCollectionByNameOrId(userResourcesCollection)
	if err != nil {
		t.Fatal(err)
	}
	if resources.Fields.GetByName("no_text_reason") != nil {
		t.Fatal("reverting must remove no_text_reason")
	}
	if _, err := app.FindFirstRecordByFilter(configsCollection, `key = "resources.max_file_size_mb"`); err == nil {
		t.Fatal("reverting must remove the size setting")
	}
}
