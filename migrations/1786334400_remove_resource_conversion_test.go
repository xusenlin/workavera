package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestRemoveResourceConversionMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	resources, err := app.FindCollectionByNameOrId(userResourcesCollection)
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"converted_markdown", "converted_size", "no_text_reason"} {
		if resources.Fields.GetByName(field) != nil {
			t.Fatalf("%s must be removed from user_resources", field)
		}
	}
	for _, field := range []string{"owner", "file", "original_name", "display_name", "media_type", "size", "sha256"} {
		if resources.Fields.GetByName(field) == nil {
			t.Fatalf("%s must stay on user_resources", field)
		}
	}

	if err := restoreResourceConversion(app); err != nil {
		t.Fatalf("restore resource conversion fields: %v", err)
	}
	resources, err = app.FindCollectionByNameOrId(userResourcesCollection)
	if err != nil {
		t.Fatal(err)
	}
	if markdown, ok := resources.Fields.GetByName("converted_markdown").(*core.TextField); !ok || markdown.Required {
		t.Fatalf("reverting must restore optional converted_markdown: %#v", markdown)
	}
	if size, ok := resources.Fields.GetByName("converted_size").(*core.NumberField); !ok || size.Required {
		t.Fatalf("reverting must restore optional converted_size: %#v", size)
	}
	if reason, ok := resources.Fields.GetByName("no_text_reason").(*core.SelectField); !ok || len(reason.Values) != 5 {
		t.Fatalf("reverting must restore no_text_reason: %#v", reason)
	}
}
