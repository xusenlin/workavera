package resources

import (
	"context"
	"testing"
	"time"
)

func TestListMatchesNamesForTheOwnerOnly(t *testing.T) {
	app := newTestApp(t)
	owner := createTestUser(t, app, "list-owner@example.com")
	other := createTestUser(t, app, "list-other@example.com")

	uploadText(t, app, owner.Id, "Notes.txt", "The ALPHA launch slipped a week.")
	time.Sleep(5 * time.Millisecond)
	byName := uploadText(t, app, owner.Id, "Alpha plan.md", "Milestones only.")
	time.Sleep(5 * time.Millisecond)
	uploadText(t, app, owner.Id, "100% literal_match.txt", "Nothing to see.")
	uploadText(t, app, other.Id, "Alpha secrets.txt", "alpha")

	result, err := List(context.Background(), app, owner.Id, "  alpha ", 0)
	if err != nil {
		t.Fatal(err)
	}
	if result.Query != "alpha" || len(result.Resources) != 1 || result.Truncated || result.Resources[0].ID != byName.ID {
		t.Fatalf("expected only owner's name match: %#v", result)
	}

	all, err := List(context.Background(), app, owner.Id, "", 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(all.Resources) != 2 || !all.Truncated || all.Resources[0].Name != "100% literal_match.txt" {
		t.Fatalf("listing must be newest first and report truncation: %#v", all)
	}

	// LIKE wildcards in the query are matched literally.
	literal, err := List(context.Background(), app, owner.Id, "0% lit", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(literal.Resources) != 1 || literal.Resources[0].Name != "100% literal_match.txt" {
		t.Fatalf("expected literal wildcard match: %#v", literal)
	}
	none, err := List(context.Background(), app, owner.Id, "a_pha", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(none.Resources) != 0 {
		t.Fatalf("underscore must not act as a wildcard: %#v", none)
	}
}

func TestSnapshotsKeepRequestedOrderAndRejectForeignIDs(t *testing.T) {
	app := newTestApp(t)
	owner := createTestUser(t, app, "snapshot-owner@example.com")
	other := createTestUser(t, app, "snapshot-other@example.com")

	first := uploadText(t, app, owner.Id, "one.txt", "one")
	second := uploadText(t, app, owner.Id, "two.json", `{"two":2}`)
	foreign := uploadText(t, app, other.Id, "three.txt", "three")

	snapshots, err := Snapshots(app, owner.Id, []string{second.ID, first.ID})
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshots) != 2 || snapshots[0].ResourceID != second.ID || snapshots[0].MediaType != "application/json" || snapshots[0].Size != 9 || snapshots[1].Name != "one.txt" {
		t.Fatalf("unexpected snapshots: %#v", snapshots)
	}
	if _, err := Snapshots(app, owner.Id, []string{first.ID, foreign.ID}); !IsNotFound(err) {
		t.Fatalf("a foreign resource must fail the whole call, got %v", err)
	}
}
