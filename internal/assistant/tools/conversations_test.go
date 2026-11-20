package tools

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/tests"
)

func TestConversationHistorySearchAndRead(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	// Use distinct owners without provisioning model settings or starting a chat run.
	exec := func(query string, params dbx.Params) {
		t.Helper()
		if _, err := app.DB().NewQuery(query).Bind(params).Execute(); err != nil {
			t.Fatal(err)
		}
	}
	for id, owner := range map[string]string{"mine": "me", "archive": "me", "foreign": "them", "current": "me"} {
		status := "active"
		if id == "archive" {
			status = "archived"
		}
		exec("INSERT INTO chat_conversations(id,owner,title,status) VALUES ({:id},{:owner},{:id},{:status})", dbx.Params{"id": id, "owner": owner, "status": status})
	}
	add := func(id, c, status string, seq int, parts any) {
		t.Helper()
		raw, _ := json.Marshal(parts)
		exec("INSERT INTO chat_messages(id,conversation,role,status,sequence,parts) VALUES ({:id},{:c},'assistant',{:s},{:n},{:p})", dbx.Params{"id": id, "c": c, "s": status, "n": seq, "p": string(raw)})
	}
	body := func(text string) any { return []map[string]string{{"type": "text", "text": text}} }
	add("hidden", "mine", "complete", 0, []map[string]string{{"type": "reasoning", "text": "hidden keyword"}, {"type": "dynamic-tool", "output": "hidden keyword"}})
	add("skip", "mine", "error", 1, body("hidden keyword"))
	add("match", "mine", "complete", 2, body("报价"+strings.Repeat("。", 8000)+"USD /api/resource-downloads/secrettoken/file"))
	add("other", "foreign", "complete", 0, body("报价 USD"))
	add("old", "archive", "complete", 0, body("usd"))
	add("here", "current", "complete", 0, body("usd 报价 hereonly"))
	ctx := t.Context()
	for _, archives := range []bool{false, true} {
		found, err := findConversations(ctx, app, "me", "current", conversationFind{Query: "current", IncludeArchived: archives})
		if err != nil || len(found["conversations"].([]conversationInfo)) != 0 {
			t.Fatal(found, err)
		}
		only, err := searchMessages(ctx, app, "me", "current", conversationSearch{Keywords: []string{"hereonly"}, IncludeArchived: archives})
		if err != nil || len(only["hits"].([]messageHit)) != 0 {
			t.Fatal(only, err)
		}
	}
	// When no current conversation is active (e.g. MCP), all of the owner's conversations are searchable and readable.
	mcpFound, err := findConversations(ctx, app, "me", "", conversationFind{Query: "current"})
	if err != nil || len(mcpFound["conversations"].([]conversationInfo)) != 1 {
		t.Fatal(mcpFound, err)
	}
	mcpHits, err := searchMessages(ctx, app, "me", "", conversationSearch{Keywords: []string{"hereonly"}})
	if err != nil || len(mcpHits["hits"].([]messageHit)) != 1 || mcpHits["hits"].([]messageHit)[0].MessageID != "here" {
		t.Fatal(mcpHits, err)
	}
	mcpRead, err := readConversation(ctx, app, "me", "", conversationRead{ConversationID: "current"})
	if err != nil || len(mcpRead["messages"].([]historyMessage)) != 1 || mcpRead["messages"].([]historyMessage)[0].ID != "here" {
		t.Fatal(mcpRead, err)
	}
	if _, err := readConversation(ctx, nil, "me", "current", conversationRead{ConversationID: " current "}); err != currentReadError {
		t.Fatal(err)
	}
	for _, msg := range []string{"here", "missing"} {
		if _, err := sendConversation(ctx, nil, "me", "current", conversationSend{ConversationID: "current", MessageID: msg}); err != currentSendError {
			t.Fatal(err)
		}
	}
	for _, input := range []conversationSend{{ConversationID: "foreign", MessageID: "other"}, {ConversationID: "mine", MessageID: "other"}, {ConversationID: "mine", MessageID: "skip"}, {ConversationID: "mine", MessageID: "hidden"}, {ConversationID: "mine", MessageID: "missing"}} {
		if _, err := sendConversation(ctx, app, "me", "current", input); !errors.Is(err, sql.ErrNoRows) {
			t.Fatalf("invalid target %v: %v", input, err)
		}
	}
	card, err := sendConversation(ctx, app, "me", "current", conversationSend{ConversationID: "mine", MessageID: "match", MatchedKeywords: []string{"usd", "USD", "absent"}})
	if err != nil || card.Title != "mine" || card.MessageID != "match" || card.ConversationID != "mine" || !strings.HasPrefix(card.Excerpt, "…") || !strings.Contains(card.Excerpt, "USD") || strings.Contains(card.Excerpt, "secrettoken") || !slices.Equal(card.MatchedKeywords, []string{"usd"}) {
		t.Fatal(card, err)
	}
	archived, err := sendConversation(ctx, app, "me", "current", conversationSend{ConversationID: "archive", MessageID: "old", MatchedKeywords: []string{"absent"}})
	if err != nil || archived.Excerpt != "usd" || len(archived.MatchedKeywords) != 0 {
		t.Fatal(archived, err)
	}
	page, err := searchMessages(ctx, app, "me", "current", conversationSearch{Keywords: []string{"usd", "报价", "USD", "hidden", "missing"}})
	if err != nil {
		t.Fatal(err)
	}
	hits := page["hits"].([]messageHit)
	if len(hits) != 1 || hits[0].Offset != 1 || hits[0].MessageID != "match" || !slices.Equal(hits[0].MatchedKeywords, []string{"usd", "报价"}) || !strings.Contains(hits[0].Excerpt, "报价") {
		t.Fatal(hits)
	}
	result, err := readConversation(ctx, app, "me", "current", conversationRead{ConversationID: "mine", Offset: hits[0].Offset})
	if err != nil {
		t.Fatal(err)
	}
	msgs := result["messages"].([]historyMessage)
	if len(msgs) != 1 || msgs[0].ID != "match" || len([]rune(msgs[0].Text)) != 8000 {
		t.Fatal("incorrect read position or budget")
	}
	next := result["next"].(map[string]int)
	tail, err := readConversation(ctx, app, "me", "current", conversationRead{ConversationID: "mine", Offset: next["offset"], CharOffset: next["charOffset"]})
	if err != nil {
		t.Fatal(err)
	}
	if got := tail["messages"].([]historyMessage)[0].Text; got != "。。USD /api/resource-downloads/[redacted]/file" {
		t.Fatal(got)
	}
	empty, err := searchMessages(ctx, app, "me", "current", conversationSearch{Keywords: []string{"hidden", "secrettoken", "%"}})
	if err != nil || len(empty["hits"].([]messageHit)) != 0 {
		t.Fatal(empty, err)
	}
	page, err = searchMessages(ctx, app, "me", "current", conversationSearch{Keywords: []string{"usd"}, IncludeArchived: true})
	if err != nil || len(page["hits"].([]messageHit)) != 2 {
		t.Fatal(page, err)
	}
	for _, id := range []string{"foreign", "missing"} {
		if _, err := readConversation(ctx, app, "me", "current", conversationRead{ConversationID: id}); !errors.Is(err, sql.ErrNoRows) {
			t.Fatalf("%s: %v", id, err)
		}
	}
	for _, n := range []int{0, 21} {
		if _, err := readConversation(ctx, app, "me", "current", conversationRead{ConversationID: "mine", Limit: &n}); err == nil {
			t.Fatalf("accepted limit %d", n)
		}
	}
	found, err := findConversations(ctx, app, "me", "mine", conversationFind{Query: "archive"})
	if err != nil || len(found["conversations"].([]conversationInfo)) != 1 {
		t.Fatal(found, err)
	}
	for i := 0; i < 30; i++ {
		add(fmt.Sprintf("batch%02d", i), "mine", "complete", i+3, body("Batch"))
	}
	first, err := searchMessages(ctx, app, "me", "current", conversationSearch{Keywords: []string{"batch"}})
	if err != nil || len(first["hits"].([]messageHit)) != 20 {
		t.Fatal(first, err)
	}
	second, err := searchMessages(ctx, app, "me", "current", conversationSearch{Keywords: []string{"batch"}, Offset: first["nextOffset"].(int)})
	if err != nil || len(second["hits"].([]messageHit)) != 10 {
		t.Fatal(second, err)
	}
	ids := map[string]bool{}
	for _, p := range []map[string]any{first, second} {
		for _, hit := range p["hits"].([]messageHit) {
			if ids[hit.MessageID] {
				t.Fatal("duplicate hit", hit)
			}
			ids[hit.MessageID] = true
		}
	}
	ten := 10
	window, err := readConversation(ctx, app, "me", "current", conversationRead{ConversationID: "mine", Offset: 20, Limit: &ten})
	if err != nil {
		t.Fatal(err)
	}
	windowMessages := window["messages"].([]historyMessage)
	if len(windowMessages) != 10 || windowMessages[0].ID != "batch18" || windowMessages[9].Offset != 29 {
		t.Fatal(window)
	}

}
