package migrations

import (
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestReadingItemsMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	items, err := app.FindCollectionByNameOrId(readingItemsCollection)
	if err != nil {
		t.Fatalf("missing reading items collection: %v", err)
	}

	owner, ok := items.Fields.GetByName("owner").(*core.RelationField)
	if !ok || !owner.Required || owner.MaxSelect != 1 || !owner.CascadeDelete {
		t.Fatalf("unexpected owner field: %#v", owner)
	}
	project, ok := items.Fields.GetByName("project").(*core.RelationField)
	if !ok || project.Required || project.MaxSelect != 1 {
		t.Fatalf("unexpected project field: %#v", project)
	}
	status, ok := items.Fields.GetByName("status").(*core.SelectField)
	if !ok || !status.Required || strings.Join(status.Values, ",") != "unread,read,archived" {
		t.Fatalf("unexpected status field: %#v", status)
	}
	if _, ok := items.Fields.GetByName("tags").(*core.JSONField); !ok {
		t.Fatal("reading items must expose tags as JSON")
	}
	if _, ok := items.Fields.GetByName("key_points").(*core.JSONField); !ok {
		t.Fatal("reading items must expose key_points as JSON")
	}
	if _, ok := items.Fields.GetByName("summary_language").(*core.TextField); !ok {
		t.Fatal("reading items must expose summary_language as a text field")
	}
	if _, ok := items.Fields.GetByName("pinned").(*core.BoolField); !ok {
		t.Fatal("reading items must expose pinned as a boolean field")
	}
	if items.Fields.GetByName("created") == nil || items.Fields.GetByName("updated") == nil {
		t.Fatal("reading items must expose created and updated timestamps")
	}

	if items.ListRule == nil || *items.ListRule != `owner = @request.auth.id` {
		t.Fatalf("unexpected list rule: %v", items.ListRule)
	}
	if items.ViewRule == nil || *items.ViewRule != *items.ListRule {
		t.Fatalf("unexpected view rule: %v", items.ViewRule)
	}
	if items.CreateRule == nil || *items.CreateRule != `@request.auth.id != "" && @request.body.owner = @request.auth.id && @request.body.pinned != true` {
		t.Fatalf("unexpected create rule: %v", items.CreateRule)
	}
	if items.UpdateRule == nil || *items.UpdateRule != `owner = @request.auth.id && @request.body.owner:changed = false && (@request.body.pinned:changed = false || @request.body.pinned = false)` {
		t.Fatalf("unexpected update rule: %v", items.UpdateRule)
	}
	if items.DeleteRule == nil || *items.DeleteRule != `owner = @request.auth.id` {
		t.Fatalf("unexpected delete rule: %v", items.DeleteRule)
	}

	if err := dropReadingItemsCollection(app); err != nil {
		t.Fatalf("drop reading items: %v", err)
	}
	if _, err := app.FindCollectionByNameOrId(readingItemsCollection); err == nil {
		t.Fatal("expected reading items collection to be removed")
	}
}
