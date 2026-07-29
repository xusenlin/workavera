package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/types"
)

func TestBackfillConversationLastMessageAt(t *testing.T) {
	app, err := tests.NewTestApp(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	collection, err := app.FindCollectionByNameOrId(chatConversationsCollection)
	if err != nil {
		t.Fatal(err)
	}

	undated := core.NewRecord(collection)
	undated.Set("owner", demoUserID)
	undated.Set("title", "Never used")
	undated.Set("status", "active")
	if err := app.Save(undated); err != nil {
		t.Fatal(err)
	}

	dated := core.NewRecord(collection)
	dated.Set("owner", demoUserID)
	dated.Set("title", "Has messages")
	dated.Set("status", "active")
	messagedAt, err := types.ParseDateTime("2020-01-01 00:00:00.000Z")
	if err != nil {
		t.Fatal(err)
	}
	dated.Set("last_message_at", messagedAt)
	if err := app.Save(dated); err != nil {
		t.Fatal(err)
	}

	if err := backfillConversationLastMessageAt(app); err != nil {
		t.Fatalf("backfill: %v", err)
	}

	backfilled, err := app.FindRecordById(chatConversationsCollection, undated.Id)
	if err != nil {
		t.Fatal(err)
	}
	if got := backfilled.GetString("last_message_at"); got != undated.GetString("created") {
		t.Fatalf("undated conversation should fall back to its created date, got %q", got)
	}

	untouched, err := app.FindRecordById(chatConversationsCollection, dated.Id)
	if err != nil {
		t.Fatal(err)
	}
	if got := untouched.GetString("last_message_at"); got != messagedAt.String() {
		t.Fatalf("dated conversation must keep its last_message_at, got %q", got)
	}
}
