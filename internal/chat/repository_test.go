package chat

import (
	"fmt"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	workagent "github.com/xusenlin/workavera/internal/agent"
)

func seedConversationMessages(t *testing.T, server *chatTestServer, conversationID string, count int) {
	t.Helper()
	collection, err := server.app.FindCollectionByNameOrId(messagesCollection)
	if err != nil {
		t.Fatal(err)
	}
	for sequence := 0; sequence < count; sequence++ {
		record := core.NewRecord(collection)
		record.Set("conversation", conversationID)
		record.Set("sequence", sequence)
		role := "user"
		if sequence%2 == 1 {
			role = "assistant"
		}
		record.Set("role", role)
		record.Set("status", "complete")
		record.Set("parts", []workagent.Part{{"type": "text", "text": fmt.Sprintf("message-%d", sequence)}})
		if err := server.app.Save(record); err != nil {
			t.Fatal(err)
		}
	}
}

func TestLoadConversationMessagesReturnsFullHistoryWithoutSummary(t *testing.T) {
	server := newChatTestServer(t)
	conversationID := server.createConversation(t)
	seedConversationMessages(t, server, conversationID, 41)

	conversation, err := server.app.FindRecordById(conversationsCollection, conversationID)
	if err != nil {
		t.Fatal(err)
	}
	history, err := loadConversationMessages(server.app, conversation, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(history) != 41 {
		t.Fatalf("expected the full 41-message history, got %d", len(history))
	}
	if history[0].Role != "user" || history[len(history)-1].Role != "user" {
		t.Fatalf("history must start and end with a user message")
	}
	if text, _ := history[0].Parts[0]["text"].(string); text != "message-0" {
		t.Fatalf("expected oldest message-0, got %q", text)
	}
	if text, _ := history[len(history)-1].Parts[0]["text"].(string); text != "message-40" {
		t.Fatalf("expected newest message-40, got %q", text)
	}
}

func TestLoadConversationMessagesInjectsSummaryAndSkipsCompactedMessages(t *testing.T) {
	server := newChatTestServer(t)
	conversationID := server.createConversation(t)
	seedConversationMessages(t, server, conversationID, 41)

	conversation, err := server.app.FindRecordById(conversationsCollection, conversationID)
	if err != nil {
		t.Fatal(err)
	}
	conversation.Set("context_summary", "The user is planning a trip to Osaka.")
	conversation.Set("summary_until_sequence", 33)
	if err := server.app.Save(conversation); err != nil {
		t.Fatal(err)
	}

	history, err := loadConversationMessages(server.app, conversation, "")
	if err != nil {
		t.Fatal(err)
	}
	// Summary message + sequences 34..40.
	if len(history) != 8 {
		t.Fatalf("expected summary plus 7 tail messages, got %d", len(history))
	}
	if history[0].Role != "user" {
		t.Fatal("summary must be injected as a user message")
	}
	if text, _ := history[0].Parts[0]["text"].(string); !strings.Contains(text, "planning a trip to Osaka") {
		t.Fatalf("summary text missing from injected message: %q", text)
	}
	if text, _ := history[1].Parts[0]["text"].(string); text != "message-34" {
		t.Fatalf("tail must start right after the summary boundary, got %q", text)
	}
	if text, _ := history[len(history)-1].Parts[0]["text"].(string); text != "message-40" {
		t.Fatalf("expected newest message-40, got %q", text)
	}
}
