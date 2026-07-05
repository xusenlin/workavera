package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const (
	chatConversationsCollection = "chat_conversations"
	chatMessagesCollection      = "chat_messages"
)

func init() {
	m.Register(createChatCollections, dropChatCollections)
}

func createChatCollections(app core.App) error {
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}
	models, err := app.FindCollectionByNameOrId(llmModelsCollection)
	if err != nil {
		return err
	}

	protocol, ok := models.Fields.GetByName("protocol").(*core.SelectField)
	if ok {
		protocol.Values = []string{"openai", "openai-compatible", "anthropic", "google"}
		if err := app.Save(models); err != nil {
			return err
		}
	}
	modelRecords, err := app.FindAllRecords(llmModelsCollection)
	if err != nil {
		return err
	}
	for _, record := range modelRecords {
		switch record.GetString("base_url") {
		case "https://api.anthropic.com/v1":
			record.Set("base_url", "https://api.anthropic.com")
		case "https://generativelanguage.googleapis.com/v1beta":
			record.Set("base_url", "https://generativelanguage.googleapis.com/")
		default:
			continue
		}
		if err := app.Save(record); err != nil {
			return err
		}
	}

	conversations := core.NewBaseCollection(chatConversationsCollection)
	conversations.Fields.Add(
		&core.RelationField{Name: "owner", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.TextField{Name: "title", Required: true, Max: 200, Presentable: true},
		&core.SelectField{Name: "status", Required: true, MaxSelect: 1, Values: []string{"active", "archived"}},
		&core.BoolField{Name: "pinned"},
		&core.DateField{Name: "last_message_at"},
		&core.NumberField{Name: "message_count", OnlyInt: true},
		&core.NumberField{Name: "tool_call_count", OnlyInt: true},
		&core.NumberField{Name: "input_tokens", OnlyInt: true},
		&core.NumberField{Name: "output_tokens", OnlyInt: true},
		&core.NumberField{Name: "total_tokens", OnlyInt: true},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	conversations.AddIndex("idx_chat_conversations_owner_status_updated", false, "owner, status, updated", "")
	conversations.AddIndex("idx_chat_conversations_owner_pinned_last", false, "owner, pinned, last_message_at", "")
	if err := app.Save(conversations); err != nil {
		return err
	}

	messages := core.NewBaseCollection(chatMessagesCollection)
	messages.Fields.Add(
		&core.RelationField{Name: "conversation", CollectionId: conversations.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.NumberField{Name: "sequence", OnlyInt: true},
		&core.SelectField{Name: "role", Required: true, MaxSelect: 1, Values: []string{"user", "assistant"}},
		&core.SelectField{Name: "status", Required: true, MaxSelect: 1, Values: []string{"pending", "streaming", "complete", "error", "cancelled"}},
		&core.RelationField{Name: "model_config", CollectionId: models.Id, MaxSelect: 1},
		&core.JSONField{Name: "parts", MaxSize: 4 * 1024 * 1024},
		&core.JSONField{Name: "metadata", MaxSize: 512 * 1024},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	if err := app.Save(messages); err != nil {
		return err
	}

	messages.Fields.Add(&core.RelationField{Name: "parent_message", CollectionId: messages.Id, MaxSelect: 1})
	messages.AddIndex("idx_chat_messages_conversation_sequence", true, "conversation, sequence", "")
	messages.AddIndex("idx_chat_messages_conversation_created", false, "conversation, created", "")
	messages.AddIndex("idx_chat_messages_parent", false, "parent_message", "")
	messages.AddIndex("idx_chat_messages_model", false, "model_config", "")
	return app.Save(messages)
}

func dropChatCollections(app core.App) error {
	if messages, err := app.FindCollectionByNameOrId(chatMessagesCollection); err == nil {
		if err := app.Delete(messages); err != nil {
			return err
		}
	}
	if conversations, err := app.FindCollectionByNameOrId(chatConversationsCollection); err == nil {
		if err := app.Delete(conversations); err != nil {
			return err
		}
	}
	if models, err := app.FindCollectionByNameOrId(llmModelsCollection); err == nil {
		if protocol, ok := models.Fields.GetByName("protocol").(*core.SelectField); ok {
			protocol.Values = []string{"openai", "anthropic", "google"}
			return app.Save(models)
		}
	}
	return nil
}
