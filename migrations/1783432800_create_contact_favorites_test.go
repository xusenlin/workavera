package migrations

import (
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestContactFavoritesMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	favorites, err := app.FindCollectionByNameOrId(contactFavoritesCollection)
	if err != nil {
		t.Fatalf("missing contact favorites collection: %v", err)
	}

	owner, ok := favorites.Fields.GetByName("owner").(*core.RelationField)
	if !ok || !owner.Required || owner.MaxSelect != 1 || !owner.CascadeDelete {
		t.Fatalf("unexpected owner field: %#v", owner)
	}
	contact, ok := favorites.Fields.GetByName("contact").(*core.RelationField)
	if !ok || !contact.Required || contact.MaxSelect != 1 || !contact.CascadeDelete {
		t.Fatalf("unexpected contact field: %#v", contact)
	}
	if owner.CollectionId != contact.CollectionId {
		t.Fatal("owner and contact should reference the same users collection")
	}
	if favorites.Fields.GetByName("created") == nil || favorites.Fields.GetByName("updated") == nil {
		t.Fatal("contact favorites must expose created and updated timestamps")
	}

	if favorites.ListRule == nil || *favorites.ListRule != `@request.auth.id != "" && owner = @request.auth.id` {
		t.Fatalf("unexpected list rule: %v", favorites.ListRule)
	}
	if favorites.ViewRule == nil || *favorites.ViewRule != *favorites.ListRule {
		t.Fatalf("unexpected view rule: %v", favorites.ViewRule)
	}
	if favorites.CreateRule == nil || *favorites.CreateRule != `@request.auth.id != "" && @request.body.owner = @request.auth.id` {
		t.Fatalf("unexpected create rule: %v", favorites.CreateRule)
	}
	if favorites.UpdateRule != nil {
		t.Fatalf("updates should be disabled, got: %v", favorites.UpdateRule)
	}
	if favorites.DeleteRule == nil || *favorites.DeleteRule != `owner = @request.auth.id` {
		t.Fatalf("unexpected delete rule: %v", favorites.DeleteRule)
	}

	foundUnique := false
	for _, index := range favorites.Indexes {
		if strings.Contains(strings.ToLower(index), "unique") && strings.Contains(index, "owner") && strings.Contains(index, "contact") {
			foundUnique = true
			break
		}
	}
	if !foundUnique {
		t.Fatalf("expected unique owner/contact index, got: %v", favorites.Indexes)
	}

	if err := dropContactFavoritesCollection(app); err != nil {
		t.Fatalf("drop contact favorites: %v", err)
	}
	if _, err := app.FindCollectionByNameOrId(contactFavoritesCollection); err == nil {
		t.Fatal("expected contact favorites collection to be removed")
	}
}
