package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestAddDocKindMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	docs, err := app.FindCollectionByNameOrId(docsCollection)
	if err != nil {
		t.Fatal(err)
	}
	field, ok := docs.Fields.GetByName("kind").(*core.SelectField)
	if !ok {
		t.Fatal("docs must expose a kind select field")
	}
	if !field.Required || field.MaxSelect != 1 {
		t.Fatalf("kind must be a required single select, got %#v", field)
	}
	want := map[string]bool{"markdown": true, "html": true}
	if len(field.Values) != len(want) {
		t.Fatalf("unexpected kind values: %v", field.Values)
	}
	for _, value := range field.Values {
		if !want[value] {
			t.Fatalf("unexpected kind value %q", value)
		}
	}
}
