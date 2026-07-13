package chat

import (
	"fmt"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	workagent "github.com/xusenlin/workavera/internal/agent"
)

func TestLoadConversationMessagesLimitsRecentUserTurns(t *testing.T) {
	server := newChatTestServer(t)
	conversationID := server.createConversation(t)
	collection, err := server.app.FindCollectionByNameOrId(messagesCollection)
	if err != nil {
		t.Fatal(err)
	}

	for sequence := 0; sequence <= 40; sequence++ {
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

	history, err := loadConversationMessages(server.app, conversationID, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(history) != 29 {
		t.Fatalf("expected current user plus 14 complete turns, got %d messages", len(history))
	}
	if history[0].Role != "user" || history[len(history)-1].Role != "user" {
		t.Fatalf("history must start and end with a user message: %#v", history)
	}
	userTurns := 0
	for _, message := range history {
		if message.Role == "user" {
			userTurns++
		}
	}
	if userTurns != maxHistoryUserTurns {
		t.Fatalf("expected %d user turns, got %d", maxHistoryUserTurns, userTurns)
	}
	if text, _ := history[0].Parts[0]["text"].(string); text != "message-12" {
		t.Fatalf("expected oldest retained message-12, got %q", text)
	}
	if text, _ := history[len(history)-1].Parts[0]["text"].(string); text != "message-40" {
		t.Fatalf("expected newest retained message-40, got %q", text)
	}
}
