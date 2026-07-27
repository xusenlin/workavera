package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const mcpServersCollection = "mcp_servers"

// presetServers are well-known public MCP endpoints offered as a starting
// point so the feature is not an empty screen. They need no credentials.
//
// Each one is created disabled and with no tool definitions: the user still has
// to refresh the server and choose which tools to enable. Seeding them any
// other way would put tool definitions in front of the assistant that nobody
// reviewed, which is exactly what the locked-definition model exists to
// prevent.
//
// internal/mcpclient holds its own copy of this list for accounts created
// after this migration ran. The duplication is deliberate: a migration is
// frozen history and has to keep replaying correctly from an empty database
// even after the feature's list changes, so it must not depend on the current
// one. Adding a preset for existing accounts needs a new migration.
var presetServers = []struct {
	Name string
	Slug string
	URL  string
}{
	{Name: "Hugging Face", Slug: "huggingface", URL: "https://hf.co/mcp"},
	{Name: "DeepWiki", Slug: "deepwiki", URL: "https://mcp.deepwiki.com/mcp"},
	{Name: "Exa Search", Slug: "exa", URL: "https://mcp.exa.ai/mcp"},
}

func init() {
	m.Register(createMCPServersCollection, dropMCPServersCollection)
}

func createMCPServersCollection(app core.App) error {
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}

	servers := core.NewBaseCollection(mcpServersCollection)
	ownerRule := `@request.auth.id != "" && owner = @request.auth.id`
	servers.ListRule = types.Pointer(ownerRule)
	servers.ViewRule = servers.ListRule
	servers.DeleteRule = types.Pointer(ownerRule)
	// Creating and updating a server goes through the feature routes: they
	// validate the endpoint, keep credentials write-only, and guarantee that
	// tool definitions only ever originate from a refresh the user accepted.
	servers.CreateRule = nil
	servers.UpdateRule = nil
	servers.Fields.Add(
		&core.RelationField{Name: "owner", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.TextField{Name: "name", Required: true, Max: 100, Presentable: true},
		&core.TextField{Name: "slug", Required: true, Max: 20, Pattern: `^[a-z][a-z0-9_]{0,19}$`},
		&core.SelectField{Name: "transport", Required: true, MaxSelect: 1, Values: []string{"http", "sse"}},
		&core.TextField{Name: "url", Required: true, Max: 2000},
		// Hidden: these headers carry the owner's personal upstream
		// credentials and must never reach a read path.
		&core.JSONField{Name: "headers", Hidden: true, MaxSize: 16 * 1024},
		&core.SelectField{Name: "approval_policy", Required: true, MaxSelect: 1, Values: []string{"all", "writes", "none"}},
		&core.BoolField{Name: "enabled"},
		&core.JSONField{Name: "tools", MaxSize: 512 * 1024},
		&core.TextField{Name: "last_error", Max: 500},
		&core.DateField{Name: "last_refreshed"},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	servers.AddIndex("idx_mcp_servers_owner_slug", true, "owner, slug", "")
	if err := app.Save(servers); err != nil {
		return err
	}

	return seedPresetServers(app, servers)
}

// seedPresetServers gives every existing account the preset endpoints. The
// owner relation is required, so a preset has to belong to someone; accounts
// created later start empty and add their own.
func seedPresetServers(app core.App, servers *core.Collection) error {
	userRecords, err := app.FindRecordsByFilter(usersCollectionName, "", "id", 0, 0)
	if err != nil {
		return err
	}
	for _, user := range userRecords {
		for _, preset := range presetServers {
			record := core.NewRecord(servers)
			record.Set("owner", user.Id)
			record.Set("name", preset.Name)
			record.Set("slug", preset.Slug)
			record.Set("transport", "http")
			record.Set("url", preset.URL)
			record.Set("headers", "{}")
			record.Set("approval_policy", "writes")
			record.Set("enabled", false)
			record.Set("tools", "[]")
			if err := app.Save(record); err != nil {
				return err
			}
		}
	}
	return nil
}

func dropMCPServersCollection(app core.App) error {
	collection, err := app.FindCollectionByNameOrId(mcpServersCollection)
	if err != nil {
		return err
	}
	return app.Delete(collection)
}
