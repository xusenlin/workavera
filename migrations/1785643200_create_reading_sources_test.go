package migrations

import (
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestReadingSourcesMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	sources, err := app.FindCollectionByNameOrId(readingSourcesCollection)
	if err != nil {
		t.Fatalf("missing reading sources collection: %v", err)
	}

	owner, ok := sources.Fields.GetByName("owner").(*core.RelationField)
	if !ok || !owner.Required || owner.MaxSelect != 1 || !owner.CascadeDelete {
		t.Fatalf("unexpected owner field: %#v", owner)
	}
	kind, ok := sources.Fields.GetByName("kind").(*core.SelectField)
	if !ok || !kind.Required || strings.Join(kind.Values, ",") != "rss,github_trending" {
		t.Fatalf("unexpected kind field: %#v", kind)
	}
	if _, ok := sources.Fields.GetByName("params").(*core.JSONField); !ok {
		t.Fatal("reading sources must expose params as JSON")
	}
	if _, ok := sources.Fields.GetByName("enabled").(*core.BoolField); !ok {
		t.Fatal("reading sources must expose enabled as a boolean field")
	}
	if _, ok := sources.Fields.GetByName("last_fetched_at").(*core.DateField); !ok {
		t.Fatal("reading sources must expose last_fetched_at as a date field")
	}

	ownerRule := `@request.auth.id != "" && owner = @request.auth.id`
	if sources.ListRule == nil || *sources.ListRule != ownerRule {
		t.Fatalf("unexpected list rule: %v", sources.ListRule)
	}
	if sources.ViewRule == nil || *sources.ViewRule != ownerRule {
		t.Fatalf("unexpected view rule: %v", sources.ViewRule)
	}
	if sources.CreateRule == nil || *sources.CreateRule != `@request.auth.id != "" && @request.body.owner = @request.auth.id` {
		t.Fatalf("unexpected create rule: %v", sources.CreateRule)
	}
	if sources.UpdateRule == nil || *sources.UpdateRule != ownerRule+` && @request.body.owner:changed = false` {
		t.Fatalf("unexpected update rule: %v", sources.UpdateRule)
	}
	if sources.DeleteRule == nil || *sources.DeleteRule != ownerRule {
		t.Fatalf("unexpected delete rule: %v", sources.DeleteRule)
	}

	// Every account that existed when the migration ran must be able to fetch
	// something on its first visit to the panel.
	users, err := app.FindRecordsByFilter(usersCollectionName, "", "id", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, user := range users {
		count, err := app.CountRecords(readingSourcesCollection, dbx.HashExp{"owner": user.Id, "enabled": true})
		if err != nil {
			t.Fatal(err)
		}
		if int(count) != len(presetReadingSources) {
			t.Fatalf("expected %d seeded sources for %s, got %d", len(presetReadingSources), user.Id, count)
		}
	}

	if err := dropReadingSourcesCollection(app); err != nil {
		t.Fatalf("drop reading sources: %v", err)
	}
	if _, err := app.FindCollectionByNameOrId(readingSourcesCollection); err == nil {
		t.Fatal("expected reading sources collection to be removed")
	}
}
