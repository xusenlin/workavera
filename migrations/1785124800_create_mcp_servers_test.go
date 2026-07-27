package migrations

import (
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestMCPServersCollectionMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	servers, err := app.FindCollectionByNameOrId(mcpServersCollection)
	if err != nil {
		t.Fatal(err)
	}

	if servers.CreateRule != nil || servers.UpdateRule != nil {
		t.Fatal("mcp server writes must go through the feature routes so tool definitions only come from an accepted refresh")
	}
	ownerRule := `@request.auth.id != "" && owner = @request.auth.id`
	if servers.ListRule == nil || *servers.ListRule != ownerRule {
		t.Fatalf("unexpected mcp servers list rule: %v", servers.ListRule)
	}
	if servers.ViewRule == nil || *servers.ViewRule != ownerRule {
		t.Fatalf("unexpected mcp servers view rule: %v", servers.ViewRule)
	}
	if servers.DeleteRule == nil || *servers.DeleteRule != ownerRule {
		t.Fatalf("unexpected mcp servers delete rule: %v", servers.DeleteRule)
	}

	owner, ok := servers.Fields.GetByName("owner").(*core.RelationField)
	if !ok || !owner.Required || !owner.CascadeDelete || owner.MaxSelect != 1 {
		t.Fatalf("unexpected mcp server owner relation: %#v", owner)
	}

	// Upstream credentials are personal and must never be readable.
	headers, ok := servers.Fields.GetByName("headers").(*core.JSONField)
	if !ok || !headers.Hidden {
		t.Fatalf("mcp server headers must be a hidden json field: %#v", headers)
	}

	slug, ok := servers.Fields.GetByName("slug").(*core.TextField)
	if !ok || !slug.Required || slug.Pattern == "" {
		t.Fatalf("unexpected mcp server slug field: %#v", slug)
	}

	transport, ok := servers.Fields.GetByName("transport").(*core.SelectField)
	if !ok || len(transport.Values) != 2 {
		t.Fatalf("unexpected mcp server transport field: %#v", transport)
	}
	for _, value := range transport.Values {
		if value != "http" && value != "sse" {
			t.Fatalf("stdio and other local transports must not be selectable, got %q", value)
		}
	}

	policy, ok := servers.Fields.GetByName("approval_policy").(*core.SelectField)
	if !ok || !policy.Required {
		t.Fatalf("unexpected mcp server approval policy field: %#v", policy)
	}

	if _, ok := servers.Fields.GetByName("tools").(*core.JSONField); !ok {
		t.Fatal("mcp servers must store locked tool definitions")
	}

	foundSlugIndex := false
	for _, index := range servers.Indexes {
		lower := strings.ToLower(index)
		if strings.Contains(lower, "unique") && strings.Contains(lower, "slug") {
			foundSlugIndex = true
			break
		}
	}
	if !foundSlugIndex {
		t.Fatalf("expected unique owner/slug index, got: %v", servers.Indexes)
	}
}

func TestMCPServerPresetsAreInertUntilReviewed(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	users, err := app.FindRecordsByFilter(usersCollectionName, "", "id", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(users) == 0 {
		t.Skip("no accounts to seed presets for")
	}

	for _, user := range users {
		for _, preset := range presetServers {
			record, err := app.FindFirstRecordByFilter(
				mcpServersCollection,
				"owner = {:owner} && slug = {:slug}",
				dbx.Params{"owner": user.Id, "slug": preset.Slug},
			)
			if err != nil {
				t.Fatalf("preset %q missing for user %s: %v", preset.Slug, user.Id, err)
			}
			if record.GetString("url") != preset.URL {
				t.Fatalf("preset %q has url %q, want %q", preset.Slug, record.GetString("url"), preset.URL)
			}
			// A preset must reach Chat only after the user refreshes it and
			// picks tools, so it starts disabled with nothing locked in.
			if record.GetBool("enabled") {
				t.Fatalf("preset %q must start disabled", preset.Slug)
			}
			if tools := record.GetString("tools"); tools != "[]" {
				t.Fatalf("preset %q must start with no tool definitions, got %q", preset.Slug, tools)
			}
			if record.GetString("approval_policy") == "" {
				t.Fatalf("preset %q must carry an approval policy", preset.Slug)
			}
		}
	}
}
