package reading

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestTagsActualType(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	collection := core.NewBaseCollection("test_json_items")
	collection.Fields.Add(&core.TextField{Name: "title"})
	collection.Fields.Add(&core.JSONField{Name: "tags"})
	if err := app.Save(collection); err != nil {
		t.Fatal(err)
	}

	record := core.NewRecord(collection)
	record.Set("title", "test")
	record.Set("tags", []string{"go", "ai"})
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}

	fetched, err := app.FindFirstRecordByFilter("test_json_items", "id != ''", nil)
	if err != nil {
		t.Fatal(err)
	}

	result := stringArray(fetched.Get("tags"))
	if len(result) != 2 || result[0] != "go" || result[1] != "ai" {
		t.Fatalf("expected [go, ai], got %v", result)
	}
}
