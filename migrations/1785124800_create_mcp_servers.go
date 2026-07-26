package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const mcpServersCollection = "mcp_servers"

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
	return app.Save(servers)
}

func dropMCPServersCollection(app core.App) error {
	collection, err := app.FindCollectionByNameOrId(mcpServersCollection)
	if err != nil {
		return err
	}
	return app.Delete(collection)
}
