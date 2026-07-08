package migrations

import (
	"reflect"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestChatCollectionsMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	conversations, err := app.FindCollectionByNameOrId(chatConversationsCollection)
	if err != nil {
		t.Fatal(err)
	}
	if conversations.ListRule == nil || conversations.ViewRule == nil || conversations.CreateRule == nil || conversations.UpdateRule == nil || conversations.DeleteRule == nil {
		t.Fatal("chat_conversations must have API rules set for owner-scoped access")
	}
	for _, name := range []string{"owner", "model_config", "title", "status", "pinned", "last_message_at", "message_count", "tool_call_count", "input_tokens", "output_tokens", "total_tokens", "created", "updated"} {
		if conversations.Fields.GetByName(name) == nil {
			t.Fatalf("missing conversation field %s", name)
		}
	}

	messages, err := app.FindCollectionByNameOrId(chatMessagesCollection)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"conversation", "parent_message", "sequence", "role", "status", "model_config", "parts", "metadata", "created", "updated"} {
		if messages.Fields.GetByName(name) == nil {
			t.Fatalf("missing message field %s", name)
		}
	}
	parts, ok := messages.Fields.GetByName("parts").(*core.JSONField)
	if !ok || parts.MaxSize != 4*1024*1024 {
		t.Fatalf("unexpected parts field: %#v", parts)
	}
	parent, ok := messages.Fields.GetByName("parent_message").(*core.RelationField)
	if !ok || parent.CollectionId != messages.Id || parent.MaxSelect != 1 {
		t.Fatalf("unexpected parent field: %#v", parent)
	}

	models, err := app.FindCollectionByNameOrId(llmModelsCollection)
	if err != nil {
		t.Fatal(err)
	}
	protocol, ok := models.Fields.GetByName("protocol").(*core.SelectField)
	if !ok || !reflect.DeepEqual(protocol.Values, []string{"openai", "openai-compatible", "anthropic", "google"}) {
		t.Fatalf("unexpected protocols: %#v", protocol)
	}
}
