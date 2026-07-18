package migrations

import (
	"slices"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestDocsCollectionsMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	docs, err := app.FindCollectionByNameOrId(docsCollection)
	if err != nil {
		t.Fatal(err)
	}
	if docs.CreateRule != nil || docs.UpdateRule == nil || docs.DeleteRule != nil {
		t.Fatal("only personal folder moves may use the docs Records API")
	}
	status, ok := docs.Fields.GetByName("status").(*core.SelectField)
	if !ok || !slices.Equal(status.Values, []string{"draft", "archived"}) {
		t.Fatalf("unexpected docs status: %#v", status)
	}
	project, ok := docs.Fields.GetByName("project").(*core.RelationField)
	if !ok || project.Required || project.MaxSelect != 1 {
		t.Fatalf("unexpected docs project field: %#v", project)
	}

	versions, err := app.FindCollectionByNameOrId(docVersionsCollection)
	if err != nil {
		t.Fatal(err)
	}
	if versions.CreateRule != nil || versions.UpdateRule != nil || versions.DeleteRule != nil {
		t.Fatal("doc versions must be immutable through the Records API")
	}
	source, ok := versions.Fields.GetByName("source").(*core.SelectField)
	if !ok || !slices.Equal(source.Values, []string{"user", "ai", "restore"}) {
		t.Fatalf("unexpected version sources: %#v", source)
	}
}
