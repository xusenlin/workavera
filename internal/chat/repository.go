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
		MaxOutputTokens:  int(record.GetInt("max_output_tokens")),
		MaxContextTokens: int(record.GetInt("max_context_tokens")),
	}
}

// loadConversationMessages assembles the model-facing history: the active
// context summary (when present) followed by every complete message after the
// summary boundary. Persisted messages are never modified; compaction only
// moves the boundary forward and rewrites the summary.
func loadConversationMessages(app core.App, conversation *core.Record, excludeID string) ([]workagent.Message, error) {
	records, err := findMessagesAfter(app, conversation.Id, excludeID, summaryBoundary(conversation))
	if err != nil {
		return nil, err
	}
	result := make([]workagent.Message, 0, len(records)+1)
	if summary := conversation.GetString("context_summary"); summary != "" {
		result = append(result, summaryMessage(summary))
	}
	for _, record := range records {
		message, err := decodeMessageRecord(record)
		if err != nil {
			return nil, err
		}
		result = append(result, message)
	}
	return result, nil
}

// findMessagesAfter returns the complete messages with a sequence strictly
// greater than the boundary, in ascending sequence order.
func findMessagesAfter(app core.App, conversationID, excludeID string, boundary int) ([]*core.Record, error) {
	return app.FindRecordsByFilter(
		messagesCollection,
		"conversation = {:conversation} && id != {:exclude} && status = 'complete' && sequence > {:boundary}",
		"sequence",
		0,
		0,
		dbx.Params{"conversation": conversationID, "exclude": excludeID, "boundary": boundary},
	)
}

// summaryBoundary is the last message sequence covered by the active summary,
// or -1 when the conversation has never been compacted (sequences start at 0).
func summaryBoundary(conversation *core.Record) int {
	if conversation.GetString("context_summary") == "" {
		return -1
	}
	return conversation.GetInt("summary_until_sequence")
}

func summaryMessage(summary string) workagent.Message {
	return workagent.Message{
		ID:   "context-summary",
		Role: "user",
		Parts: []workagent.Part{{
			"type": "text",
			"text": "Summary of the earlier part of this conversation (older messages were compacted to fit the context window):\n\n" + summary,
		}},
	}
}

func decodeMessageRecord(record *core.Record) (workagent.Message, error) {
	parts := []workagent.Part{}
	if raw, ok := record.Get("parts").(types.JSONRaw); ok && len(raw) > 0 {
		if err := json.Unmarshal(raw, &parts); err != nil {
			return workagent.Message{}, err
		}
	}
	return workagent.Message{ID: record.Id, Role: record.GetString("role"), Parts: parts}, nil
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

func recoverInterruptedRuns(app core.App) error {
	records, err := app.FindRecordsByFilter(messagesCollection, "role = 'assistant' && status = 'streaming'", "", 0, 0)
	if err != nil {
		return err
	}
	for _, record := range records {
		metadata := messageMetadata(record)
		metadata["finishReason"] = "error"
		metadata["error"] = map[string]any{
			"code":    "run_interrupted",
			"message": "The chat run was interrupted by a server restart.",
		}
		record.Set("status", "error")
		record.Set("metadata", metadata)
		if err := app.Save(record); err != nil {
			return err
		}
	}
	return nil
}

func messageMetadata(record *core.Record) map[string]any {
	metadata := map[string]any{}
	if raw, ok := record.Get("metadata").(types.JSONRaw); ok && len(raw) > 0 {
		_ = json.Unmarshal(raw, &metadata)
	}
	return metadata
}
