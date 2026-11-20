package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestBinaryResourcesMigration(t *testing.T) {
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
	markdown, ok := resources.Fields.GetByName("converted_markdown").(*core.TextField)
	if !ok || markdown.Required {
		t.Fatalf("binary resources need an optional converted_markdown: %#v", markdown)
	}
	size, ok := resources.Fields.GetByName("converted_size").(*core.NumberField)
	if !ok || size.Required || size.Min == nil || *size.Min != 0 {
		t.Fatalf("binary resources need converted_size 0: %#v", size)
	}

	if err := disallowBinaryResources(app); err != nil {
		t.Fatalf("revert binary resources: %v", err)
	}
	resources, err = app.FindCollectionByNameOrId(userResourcesCollection)
	if err != nil {
		t.Fatal(err)
	}
	if markdown, ok := resources.Fields.GetByName("converted_markdown").(*core.TextField); !ok || !markdown.Required {
		t.Fatal("reverting must require converted_markdown again")
	}
}
