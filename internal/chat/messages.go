package chat

import (
	"encoding/json"
	"net/http"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
	workagent "github.com/xusenlin/workavera/internal/agent"
)

func (s *service) listMessages(event *core.RequestEvent) error {
	conversation, err := findOwnedConversation(event.App, event.Request.PathValue("id"), event.Auth.Id)
	if err != nil {
		return event.NotFoundError("Conversation not found.", err)
	}
	records, err := event.App.FindRecordsByFilter(messagesCollection, "conversation = {:conversation}", "sequence", 0, 0, dbx.Params{"conversation": conversation.Id})
	if err != nil {
		return event.InternalServerError("Could not load messages.", err)
	}
	messages := make([]workagent.Message, 0, len(records))
	for _, record := range records {
		message, err := messageResponse(record)
		if err != nil {
			return event.InternalServerError("Could not decode messages.", err)
		}
		messages = append(messages, message)
	}
	return event.JSON(http.StatusOK, messages)
}

func messageResponse(record *core.Record) (workagent.Message, error) {
	parts := []workagent.Part{}
	if raw, ok := record.Get("parts").(types.JSONRaw); ok && len(raw) > 0 {
		if err := json.Unmarshal(raw, &parts); err != nil {
			return workagent.Message{}, err
		}
	}
	metadata := map[string]any{}
	if raw, ok := record.Get("metadata").(types.JSONRaw); ok && len(raw) > 0 {
		if err := json.Unmarshal(raw, &metadata); err != nil {
			return workagent.Message{}, err
		}
	}
	metadata["conversationId"] = record.GetString("conversation")
	metadata["status"] = record.GetString("status")
	metadata["createdAt"] = record.GetDateTime("created").String()
	metadata["updatedAt"] = record.GetDateTime("updated").String()
	return workagent.Message{ID: record.Id, Role: record.GetString("role"), Metadata: metadata, Parts: parts}, nil
}
