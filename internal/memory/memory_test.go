package memory

import (
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"github.com/xusenlin/workavera/internal/preferences"
	_ "github.com/xusenlin/workavera/migrations"
)

func newMemoryTestUser(t *testing.T, app core.App, email string) *core.Record {
	t.Helper()
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	user := core.NewRecord(users)
	user.SetEmail(email)
	user.SetPassword("password123")
	user.Set("name", email)
	if err := app.Save(user); err != nil {
		t.Fatal(err)
	}
	if _, err := preferences.Ensure(app, user.Id); err != nil {
		t.Fatal(err)
	}
	return user
}

func setMemoryPreferences(t *testing.T, app core.App, ownerID string, enabled, automatic bool) {
	t.Helper()
	record, err := app.FindFirstRecordByFilter(preferences.CollectionName, "owner = {:owner}", dbx.Params{"owner": ownerID})
	if err != nil {
		t.Fatal(err)
	}
	record.Set("memory_enabled", enabled)
	record.Set("memory_auto_capture", automatic)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
}

func newMemorySource(t *testing.T, app core.App, ownerID string) (string, string) {
	t.Helper()
	conversations, err := app.FindCollectionByNameOrId("chat_conversations")
	if err != nil {
		t.Fatal(err)
	}
	conversation := core.NewRecord(conversations)
	conversation.Set("owner", ownerID)
	conversation.Set("title", "Memory source")
	conversation.Set("status", "active")
	if err := app.Save(conversation); err != nil {
		t.Fatal(err)
	}
	messages, err := app.FindCollectionByNameOrId("chat_messages")
	if err != nil {
		t.Fatal(err)
	}
	message := core.NewRecord(messages)
	message.Set("conversation", conversation.Id)
	message.Set("sequence", 0)
	message.Set("role", "user")
	message.Set("status", "complete")
	message.Set("parts", []map[string]any{{"type": "text", "text": "Remember this."}})
	if err := app.Save(message); err != nil {
		t.Fatal(err)
	}
	return conversation.Id, message.Id
}

func TestUpsertHonorsMemoryPreferenceAndOwnership(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	owner := newMemoryTestUser(t, app, "memory-owner@example.com")
	other := newMemoryTestUser(t, app, "memory-other@example.com")

	input := UpsertInput{Category: "preference", Content: "The user prefers concise Chinese replies.", Origin: "explicit"}
	if _, err := Upsert(app, owner.Id, "", "", input); !errors.Is(err, ErrMemoryDisabled) {
		t.Fatalf("disabled memory must reject writes, got %v", err)
	}
	setMemoryPreferences(t, app, owner.Id, true, false)
	conversationID, messageID := newMemorySource(t, app, owner.Id)
	input.Origin = "automatic"
	if _, err := Upsert(app, owner.Id, "", "", input); !errors.Is(err, ErrAutoCaptureOff) {
		t.Fatalf("automatic capture must be rejected, got %v", err)
	}

	input.Origin = "explicit"
	created, err := Upsert(app, owner.Id, conversationID, messageID, input)
	if err != nil {
		t.Fatal(err)
	}
	if created.Action != "created" || created.Memory.Origin != "explicit" || !created.Memory.Active {
		t.Fatalf("unexpected created result: %#v", created)
	}
	if created.Memory.SourceConversation != conversationID || created.Memory.SourceMessage != messageID {
		t.Fatalf("trusted source was not persisted: %#v", created.Memory)
	}

	input.ID = created.Memory.ID
	unchanged, err := Upsert(app, owner.Id, "conversation-2", "message-2", input)
	if err != nil || unchanged.Action != "unchanged" {
		t.Fatalf("expected unchanged result: %#v, %v", unchanged, err)
	}
	input.Content = "The user prefers concise replies in Chinese."
	updated, err := Upsert(app, owner.Id, "conversation-2", "message-2", input)
	if err != nil || updated.Action != "updated" || updated.Previous == nil || updated.Previous.Content != created.Memory.Content {
		t.Fatalf("unexpected update result: %#v, %v", updated, err)
	}
	undone, err := UndoUpsert(app, owner.Id, updated)
	if err != nil || undone.Action != "undone" || undone.OriginalAction != "updated" || undone.Memory.Content != created.Memory.Content || undone.UndoneAt == "" {
		t.Fatalf("unexpected update undo result: %#v, %v", undone, err)
	}
	if _, err := Upsert(app, other.Id, "", "", input); !errors.Is(err, ErrMemoryDisabled) {
		t.Fatalf("other disabled owner must not update memory: %v", err)
	}
	setMemoryPreferences(t, app, other.Id, true, false)
	if _, err := Upsert(app, other.Id, "", "", input); !errors.Is(err, ErrMemoryNotFound) {
		t.Fatalf("cross-owner update must look missing: %v", err)
	}
}

func TestUndoCreatedMemoryRequiresUnchangedRecord(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	owner := newMemoryTestUser(t, app, "memory-undo@example.com")
	setMemoryPreferences(t, app, owner.Id, true, false)
	conversationID, messageID := newMemorySource(t, app, owner.Id)

	created, err := Upsert(app, owner.Id, conversationID, messageID, UpsertInput{
		Category: "goal",
		Content:  "The user wants to ship the first release this month.",
		Origin:   "explicit",
	})
	if err != nil {
		t.Fatal(err)
	}
	record, err := findOwned(app, created.Memory.ID, owner.Id)
	if err != nil {
		t.Fatal(err)
	}
	record.Set("active", false)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	if _, err := UndoUpsert(app, owner.Id, created); !errors.Is(err, ErrMemoryChanged) {
		t.Fatalf("changed memory must reject undo, got %v", err)
	}

	created, err = Upsert(app, owner.Id, conversationID, messageID, UpsertInput{
		Category: "constraint",
		Content:  "The user cannot take meetings on Fridays.",
		Origin:   "explicit",
	})
	if err != nil {
		t.Fatal(err)
	}
	undone, err := UndoUpsert(app, owner.Id, created)
	if err != nil || undone.Action != "undone" || undone.OriginalAction != "created" {
		t.Fatalf("unexpected create undo result: %#v, %v", undone, err)
	}
	if _, err := findOwned(app, created.Memory.ID, owner.Id); err == nil {
		t.Fatal("undone created memory still exists")
	}
}

func TestAutomaticCaptureAndPromptSelection(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	owner := newMemoryTestUser(t, app, "memory-auto@example.com")
	setMemoryPreferences(t, app, owner.Id, true, true)
	conversationID, messageID := newMemorySource(t, app, owner.Id)

	result, err := Upsert(app, owner.Id, conversationID, messageID, UpsertInput{
		Category: "work",
		Content:  "The user uses pnpm for frontend package management.",
		Origin:   "automatic",
	})
	if err != nil || result.Memory.Origin != "automatic" {
		t.Fatalf("automatic memory was not saved: %#v, %v", result, err)
	}
	selected, err := ActiveForPrompt(app, owner.Id)
	if err != nil || len(selected) != 1 || selected[0].ID != result.Memory.ID {
		t.Fatalf("unexpected prompt memories: %#v, %v", selected, err)
	}
	conversation, err := app.FindRecordById("chat_conversations", conversationID)
	if err != nil {
		t.Fatal(err)
	}
	if err := app.Delete(conversation); err != nil {
		t.Fatal(err)
	}
	preserved, err := findOwned(app, result.Memory.ID, owner.Id)
	if err != nil {
		t.Fatal(err)
	}
	if preserved.GetString("source_conversation") != "" || preserved.GetString("source_message") != "" {
		t.Fatalf("deleted sources must be cleared without deleting memory: %#v", fromRecord(preserved))
	}
	forgotten, err := Forget(app, owner.Id, result.Memory.ID)
	if err != nil || forgotten.ID != result.Memory.ID {
		t.Fatalf("forget failed: %#v, %v", forgotten, err)
	}
	if _, err := Forget(app, owner.Id, result.Memory.ID); !errors.Is(err, ErrMemoryNotFound) {
		t.Fatalf("forgotten memory must be missing: %v", err)
	}
}

func TestMemoryLimit(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	owner := newMemoryTestUser(t, app, "memory-limit@example.com")
	setMemoryPreferences(t, app, owner.Id, true, false)
	collection, err := app.FindCollectionByNameOrId(CollectionName)
	if err != nil {
		t.Fatal(err)
	}
	for index := 0; index < MaxMemoriesPerUser; index++ {
		record := core.NewRecord(collection)
		record.Set("owner", owner.Id)
		record.Set("category", "personal")
		record.Set("content", fmt.Sprintf("Durable fact %d", index))
		record.Set("active", true)
		record.Set("origin", "manual")
		if err := app.Save(record); err != nil {
			t.Fatal(err)
		}
	}
	_, err = Upsert(app, owner.Id, "", "", UpsertInput{Category: "goal", Content: "One more goal", Origin: "explicit"})
	if !errors.Is(err, ErrMemoryLimit) {
		t.Fatalf("expected memory limit, got %v", err)
	}
}

func TestActiveForPromptReturnsCompleteActiveSet(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	owner := newMemoryTestUser(t, app, "memory-complete@example.com")
	setMemoryPreferences(t, app, owner.Id, true, false)
	collection, err := app.FindCollectionByNameOrId(CollectionName)
	if err != nil {
		t.Fatal(err)
	}
	for index := 0; index < 30; index++ {
		record := core.NewRecord(collection)
		record.Set("owner", owner.Id)
		record.Set("category", "personal")
		record.Set("content", fmt.Sprintf("Fact %02d %s", index, strings.Repeat("x", 440)))
		record.Set("active", true)
		record.Set("origin", "manual")
		if err := app.Save(record); err != nil {
			t.Fatal(err)
		}
	}
	inactive := core.NewRecord(collection)
	inactive.Set("owner", owner.Id)
	inactive.Set("category", "personal")
	inactive.Set("content", "This inactive memory must not be injected.")
	inactive.Set("active", false)
	inactive.Set("origin", "manual")
	if err := app.Save(inactive); err != nil {
		t.Fatal(err)
	}

	memories, err := ActiveForPrompt(app, owner.Id)
	if err != nil {
		t.Fatal(err)
	}
	if len(memories) != 30 {
		t.Fatalf("expected every active memory, got %d", len(memories))
	}
}
