package chat

import (
	"encoding/json"
	"errors"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
	workagent "github.com/xusenlin/workavera/internal/agent"
)

const (
	conversationsCollection = "chat_conversations"
	messagesCollection      = "chat_messages"
	modelsCollection        = "llm_models"
)

func findOwnedConversation(app core.App, id, ownerID string) (*core.Record, error) {
	if id == "" || ownerID == "" {
		return nil, errors.New("missing conversation")
	}
	return app.FindFirstRecordByFilter(conversationsCollection, "id = {:id} && owner = {:owner}", dbx.Params{"id": id, "owner": ownerID})
}

func findOwnedModel(app core.App, id, ownerID string) (*core.Record, error) {
	if id == "" || ownerID == "" {
		return nil, errors.New("missing model configuration")
	}
	return app.FindFirstRecordByFilter(modelsCollection, "id = {:id} && owner = {:owner}", dbx.Params{"id": id, "owner": ownerID})
}

func modelConfig(record *core.Record) workagent.ModelConfig {
	return workagent.ModelConfig{
		ID: record.Id, Name: record.GetString("name"), ModelID: record.GetString("model_id"),
		BaseURL: record.GetString("base_url"), APIKey: record.GetString("api_key"), Protocol: record.GetString("protocol"),
	}
}

func loadConversationMessages(app core.App, conversationID, excludeID string) ([]workagent.Message, error) {
	records, err := app.FindRecordsByFilter(messagesCollection, "conversation = {:conversation} && id != {:exclude} && status = 'complete'", "sequence", 0, 0, dbx.Params{"conversation": conversationID, "exclude": excludeID})
	if err != nil {
		return nil, err
	}
	result := make([]workagent.Message, 0, len(records))
	for _, record := range records {
		parts := []workagent.Part{}
		if raw, ok := record.Get("parts").(types.JSONRaw); ok && len(raw) > 0 {
			if err := json.Unmarshal(raw, &parts); err != nil {
				return nil, err
			}
		}
		result = append(result, workagent.Message{ID: record.Id, Role: record.GetString("role"), Parts: parts})
	}
	return result, nil
}

func saveMessageSnapshot(app core.App, messageID, status string, parts []workagent.Part, metadata map[string]any) error {
	record, err := app.FindRecordById(messagesCollection, messageID)
	if err != nil {
		return err
	}
	record.Set("status", status)
	record.Set("parts", parts)
	if metadata != nil {
		record.Set("metadata", metadata)
	}
	return app.Save(record)
}
