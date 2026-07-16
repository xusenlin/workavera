package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestAddContextTrackingMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	models, err := app.FindCollectionByNameOrId(llmModelsCollection)
	if err != nil {
		t.Fatal(err)
	}
	maxContext, ok := models.Fields.GetByName("max_context_tokens").(*core.NumberField)
	if !ok {
		t.Fatal("llm_models must expose a max_context_tokens number field")
	}
	if !maxContext.OnlyInt {
		t.Fatal("max_context_tokens must be integer-only")
	}

	conversations, err := app.FindCollectionByNameOrId(chatConversationsCollection)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := conversations.Fields.GetByName("context_summary").(*core.TextField); !ok {
		t.Fatal("chat_conversations must expose a context_summary text field")
	}
	for _, name := range []string{"summary_until_sequence", "context_tokens"} {
		field, ok := conversations.Fields.GetByName(name).(*core.NumberField)
		if !ok {
			t.Fatalf("chat_conversations must expose a %s number field", name)
		}
		if !field.OnlyInt {
			t.Fatalf("%s must be integer-only", name)
		}
	}
}
