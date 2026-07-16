package chat

import (
	"strings"
	"testing"

	workagent "github.com/xusenlin/workavera/internal/agent"
)

func TestPlanCompactionKeepsNewestUserTurnsAndSetsBoundary(t *testing.T) {
	server := newChatTestServer(t)
	conversationID := server.createConversation(t)
	// Sequences 0..16: user on even, assistant on odd, plus a trailing user
	// message so the newest turn is still open (17 messages, 9 user turns).
	seedConversationMessages(t, server, conversationID, 17)

	conversation, err := server.app.FindRecordById(conversationsCollection, conversationID)
	if err != nil {
		t.Fatal(err)
	}
	plan, err := planCompaction(server.app, conversation, "")
	if err != nil {
		t.Fatal(err)
	}
	if plan == nil {
		t.Fatal("expected a compaction plan for a long conversation")
	}
	// Users sit at sequences 0,2,...,16; keeping the newest 4 turns means the
	// tail starts at sequence 10, so the boundary is the assistant at 9.
	if plan.boundary != 9 {
		t.Fatalf("expected boundary 9, got %d", plan.boundary)
	}
	if !strings.Contains(plan.prompt, "message-0") || strings.Contains(plan.prompt, "message-10") {
		t.Fatalf("prompt must cover only compacted messages: %q", plan.prompt)
	}

	// A short conversation has nothing to compact.
	shortConversationID := server.createConversation(t)
	seedConversationMessages(t, server, shortConversationID, 7)
	shortConversation, err := server.app.FindRecordById(conversationsCollection, shortConversationID)
	if err != nil {
		t.Fatal(err)
	}
	shortPlan, err := planCompaction(server.app, shortConversation, "")
	if err != nil {
		t.Fatal(err)
	}
	if shortPlan != nil {
		t.Fatalf("expected no plan when only 4 user turns exist, got %#v", shortPlan)
	}
}

func TestPlanCompactionMergesPreviousSummaryRange(t *testing.T) {
	server := newChatTestServer(t)
	conversationID := server.createConversation(t)
	seedConversationMessages(t, server, conversationID, 17)

	conversation, err := server.app.FindRecordById(conversationsCollection, conversationID)
	if err != nil {
		t.Fatal(err)
	}
	conversation.Set("context_summary", "Earlier the user set up a project board.")
	conversation.Set("summary_until_sequence", 3)
	if err := server.app.Save(conversation); err != nil {
		t.Fatal(err)
	}

	plan, err := planCompaction(server.app, conversation, "")
	if err != nil {
		t.Fatal(err)
	}
	if plan == nil {
		t.Fatal("expected a compaction plan")
	}
	if !strings.Contains(plan.prompt, "Previous summary:") || !strings.Contains(plan.prompt, "project board") {
		t.Fatalf("prompt must carry the previous summary: %q", plan.prompt)
	}
	// Already-summarized messages (sequence <= 3) must not be re-summarized.
	if strings.Contains(plan.prompt, "message-2") {
		t.Fatalf("prompt must not include already-summarized messages: %q", plan.prompt)
	}
	if !strings.Contains(plan.prompt, "message-4") {
		t.Fatalf("prompt must start after the previous boundary: %q", plan.prompt)
	}
}

func TestNeedsCompactionThreshold(t *testing.T) {
	server := newChatTestServer(t)
	conversationID := server.createConversation(t)
	conversation, err := server.app.FindRecordById(conversationsCollection, conversationID)
	if err != nil {
		t.Fatal(err)
	}

	model := workagent.ModelConfig{MaxContextTokens: 100000, Protocol: "openai"}
	conversation.Set("context_tokens", 75000)
	if needsCompaction(conversation, model) {
		t.Fatal("exactly 75% must not trigger compaction")
	}
	conversation.Set("context_tokens", 75001)
	if !needsCompaction(conversation, model) {
		t.Fatal("above 75% must trigger compaction")
	}
	if needsCompaction(conversation, workagent.ModelConfig{}) {
		t.Fatal("a model without a context window must never trigger compaction")
	}
}
