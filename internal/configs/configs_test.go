package configs

import (
	"reflect"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	_ "github.com/xusenlin/workavera/migrations"
)

func TestGetSupportsJSONValueTypes(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	collection, err := app.FindCollectionByNameOrId(CollectionName)
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		key   string
		value any
		want  any
	}{
		{"test.string", "value", "value"},
		{"test.number", 42, float64(42)},
		{"test.boolean", false, false},
		{"test.array", []any{"a", float64(1)}, []any{"a", float64(1)}},
		{"test.object", map[string]any{"enabled": true}, map[string]any{"enabled": true}},
	}
	for _, test := range tests {
		record := core.NewRecord(collection)
		record.Set("key", test.key)
		record.Set("value", test.value)
		if err := app.Save(record); err != nil {
			t.Fatalf("save %s: %v", test.key, err)
		}
		got, err := Get(app, test.key)
		if err != nil {
			t.Fatalf("get %s: %v", test.key, err)
		}
		if !reflect.DeepEqual(got, test.want) {
			t.Fatalf("%s: got %#v, want %#v", test.key, got, test.want)
		}
	}
}

func TestSystemLocationFallsBackForInvalidConfig(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	record, err := app.FindFirstRecordByFilter(CollectionName, `key = "system.timezone"`)
	if err != nil {
		t.Fatal(err)
	}
	record.Set("value", "Invalid/Timezone")
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	if got := SystemLocation(app).String(); got != "Asia/Shanghai" {
		t.Fatalf("unexpected fallback timezone: %s", got)
	}
}
