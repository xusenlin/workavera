package reading

import (
	"context"
	"errors"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestSetPinnedEnforcesLimitAndIgnoresArchivedItems(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	collection := core.NewBaseCollection(itemsCollection)
	collection.Fields.Add(&core.TextField{Name: "owner", Required: true})
	collection.Fields.Add(&core.BoolField{Name: "pinned"})
	collection.Fields.Add(&core.SelectField{
		Name:      "status",
		MaxSelect: 1,
		Values:    []string{"unread", "archived"},
	})
	if err := app.Save(collection); err != nil {
		t.Fatal(err)
	}

	const ownerID = "test-owner"
	items := make([]*core.Record, maxPinnedItems+2)
	for index := range items {
		items[index] = core.NewRecord(collection)
		items[index].Set("owner", ownerID)
		items[index].Set("status", "unread")
		if err := app.Save(items[index]); err != nil {
			t.Fatalf("save item %d: %v", index, err)
		}
	}

	for index := 0; index < maxPinnedItems; index++ {
		if err := SetPinned(context.Background(), app, ownerID, items[index].Id, true); err != nil {
			t.Fatalf("pin item %d: %v", index, err)
		}
	}
	if err := SetPinned(context.Background(), app, ownerID, items[maxPinnedItems].Id, true); !errors.Is(err, ErrPinLimit) {
		t.Fatalf("expected %v, got %v", ErrPinLimit, err)
	}

	items[0].Set("status", "archived")
	if err := app.Save(items[0]); err != nil {
		t.Fatal(err)
	}
	if err := SetPinned(context.Background(), app, ownerID, items[maxPinnedItems+1].Id, true); err != nil {
		t.Fatalf("archived pins should not count toward the limit: %v", err)
	}
}

func TestMarkAllReadOnlyUpdatesOwnedUnreadItems(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	collection := core.NewBaseCollection(itemsCollection)
	collection.Fields.Add(&core.TextField{Name: "owner", Required: true})
	collection.Fields.Add(&core.SelectField{
		Name:      "status",
		MaxSelect: 1,
		Values:    []string{"unread", "read", "archived"},
	})
	if err := app.Save(collection); err != nil {
		t.Fatal(err)
	}

	createItem := func(owner, status string) *core.Record {
		t.Helper()
		record := core.NewRecord(collection)
		record.Set("owner", owner)
		record.Set("status", status)
		if err := app.Save(record); err != nil {
			t.Fatal(err)
		}
		return record
	}

	const ownerID = "test-owner"
	firstUnread := createItem(ownerID, "unread")
	secondUnread := createItem(ownerID, "unread")
	alreadyRead := createItem(ownerID, "read")
	archived := createItem(ownerID, "archived")
	otherOwner := createItem("other-owner", "unread")

	updated, err := MarkAllRead(context.Background(), app, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	if updated != 2 {
		t.Fatalf("expected 2 updated items, got %d", updated)
	}

	for _, expected := range []struct {
		record *core.Record
		status string
	}{
		{firstUnread, "read"},
		{secondUnread, "read"},
		{alreadyRead, "read"},
		{archived, "archived"},
		{otherOwner, "unread"},
	} {
		actual, err := app.FindRecordById(itemsCollection, expected.record.Id)
		if err != nil {
			t.Fatal(err)
		}
		if status := actual.GetString("status"); status != expected.status {
			t.Fatalf("expected %s to remain %q, got %q", expected.record.Id, expected.status, status)
		}
	}

	updated, err = MarkAllRead(context.Background(), app, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	if updated != 0 {
		t.Fatalf("expected idempotent second update, got %d", updated)
	}
}
