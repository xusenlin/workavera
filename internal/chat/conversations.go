package chat

import (
	"net/http"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type conversationResponse struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	Status        string `json:"status"`
	Pinned        bool   `json:"pinned"`
	MessageCount  int    `json:"messageCount"`
	ToolCallCount int    `json:"toolCallCount"`
	InputTokens   int    `json:"inputTokens"`
	OutputTokens  int    `json:"outputTokens"`
	TotalTokens   int    `json:"totalTokens"`
	LastMessageAt string `json:"lastMessageAt"`
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
}

type createConversationRequest struct {
	Title string `json:"title"`
}

type updateConversationRequest struct {
	Title  *string `json:"title"`
	Status *string `json:"status"`
	Pinned *bool   `json:"pinned"`
}

func (s *service) listConversations(event *core.RequestEvent) error {
	records, err := event.App.FindRecordsByFilter(conversationsCollection, "owner = {:owner}", "-pinned,-last_message_at,-updated", 0, 0, dbx.Params{"owner": event.Auth.Id})
	if err != nil {
		return event.InternalServerError("Could not load conversations.", err)
	}
	result := make([]conversationResponse, 0, len(records))
	for _, record := range records {
		result = append(result, toConversationResponse(record))
	}
	return event.JSON(http.StatusOK, result)
}

func (s *service) createConversation(event *core.RequestEvent) error {
	var request createConversationRequest
	if err := event.BindBody(&request); err != nil {
		return event.BadRequestError("Invalid conversation.", err)
	}
	title := strings.TrimSpace(request.Title)
	if title == "" {
		title = "New conversation"
	}
	collection, err := event.App.FindCollectionByNameOrId(conversationsCollection)
	if err != nil {
		return event.InternalServerError("Chat is not initialized.", err)
	}
	record := core.NewRecord(collection)
	record.Set("owner", event.Auth.Id)
	record.Set("title", title)
	record.Set("status", "active")
	if err := event.App.Save(record); err != nil {
		return event.BadRequestError("Could not create conversation.", err)
	}
	return event.JSON(http.StatusCreated, toConversationResponse(record))
}

func (s *service) updateConversation(event *core.RequestEvent) error {
	record, err := findOwnedConversation(event.App, event.Request.PathValue("id"), event.Auth.Id)
	if err != nil {
		return event.NotFoundError("Conversation not found.", err)
	}
	var request updateConversationRequest
	if err := event.BindBody(&request); err != nil {
		return event.BadRequestError("Invalid conversation update.", err)
	}
	if request.Title != nil {
		title := strings.TrimSpace(*request.Title)
		if title == "" {
			return event.BadRequestError("Conversation title is required.", nil)
		}
		record.Set("title", title)
	}
	if request.Status != nil {
		if *request.Status != "active" && *request.Status != "archived" {
			return event.BadRequestError("Invalid conversation status.", nil)
		}
		record.Set("status", *request.Status)
	}
	if request.Pinned != nil {
		record.Set("pinned", *request.Pinned)
	}
	if err := event.App.Save(record); err != nil {
		return event.BadRequestError("Could not update conversation.", err)
	}
	return event.JSON(http.StatusOK, toConversationResponse(record))
}

func (s *service) deleteConversation(event *core.RequestEvent) error {
	record, err := findOwnedConversation(event.App, event.Request.PathValue("id"), event.Auth.Id)
	if err != nil {
		return event.NotFoundError("Conversation not found.", err)
	}
	if err := event.App.Delete(record); err != nil {
		return event.BadRequestError("Could not delete conversation.", err)
	}
	return event.NoContent(http.StatusNoContent)
}

func toConversationResponse(record *core.Record) conversationResponse {
	return conversationResponse{
		ID: record.Id, Title: record.GetString("title"), Status: record.GetString("status"), Pinned: record.GetBool("pinned"),
		MessageCount: record.GetInt("message_count"), ToolCallCount: record.GetInt("tool_call_count"),
		InputTokens: record.GetInt("input_tokens"), OutputTokens: record.GetInt("output_tokens"), TotalTokens: record.GetInt("total_tokens"),
		LastMessageAt: record.GetDateTime("last_message_at").String(), CreatedAt: record.GetDateTime("created").String(), UpdatedAt: record.GetDateTime("updated").String(),
	}
}
