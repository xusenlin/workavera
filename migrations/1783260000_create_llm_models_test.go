package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestLLMModelsMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	collection, err := app.FindCollectionByNameOrId(llmModelsCollection)
	if err != nil {
		t.Fatal(err)
	}
	if collection.ListRule != nil || collection.ViewRule != nil || collection.CreateRule != nil || collection.UpdateRule != nil || collection.DeleteRule != nil {
		t.Fatal("llm_models must only be accessible through custom APIs")
	}

	owner, ok := collection.Fields.GetByName("owner").(*core.RelationField)
	if !ok || !owner.Required || !owner.CascadeDelete || owner.MaxSelect != 1 {
		t.Fatalf("unexpected owner field: %#v", owner)
	}
	apiKey, ok := collection.Fields.GetByName("api_key").(*core.TextField)
	if !ok || !apiKey.Hidden {
		t.Fatalf("api_key must be a hidden text field: %#v", apiKey)
	}
	protocol, ok := collection.Fields.GetByName("protocol").(*core.SelectField)
	if !ok || len(protocol.Values) != 3 || protocol.Values[0] != "openai" || protocol.Values[1] != "anthropic" || protocol.Values[2] != "google" {
		t.Fatalf("unexpected protocol field: %#v", protocol)
	}
	for _, name := range []string{"name", "model_id", "base_url", "is_default", "created", "updated"} {
		if collection.Fields.GetByName(name) == nil {
			t.Fatalf("missing field %s", name)
		}
	}
}
