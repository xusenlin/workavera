package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const readingSourcesCollection = "reading_sources"

// presetReadingSources give the discovery panel something to fetch on a first
// visit instead of an empty screen. They are all public feeds that need no
// credentials, and they are enabled because fetching one only ever produces a
// candidate list the user still has to accept.
//
// internal/reading holds its own copy of this list for accounts created after
// this migration ran. The duplication is deliberate: a migration is frozen
// history and has to keep replaying correctly from an empty database even
// after the feature's list changes, so it must not depend on the current one.
var presetReadingSources = []struct {
	Name   string
	Kind   string
	URL    string
	Params map[string]any
}{
	{Name: "GitHub Trending · Go", Kind: "github_trending", Params: map[string]any{"language": "go", "since": "weekly"}},
	{Name: "GitHub Trending · Rust", Kind: "github_trending", Params: map[string]any{"language": "rust", "since": "weekly"}},
	{Name: "GitHub Trending · TypeScript", Kind: "github_trending", Params: map[string]any{"language": "typescript", "since": "weekly"}},
	{Name: "Hacker News Front Page", Kind: "rss", URL: "https://hnrss.org/frontpage", Params: map[string]any{}},
}

func init() {
	m.Register(createReadingSourcesCollection, dropReadingSourcesCollection)
}

func createReadingSourcesCollection(app core.App) error {
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}

	sources := core.NewBaseCollection(readingSourcesCollection)
	ownerRule := `@request.auth.id != "" && owner = @request.auth.id`
	// A subscription is plain owner-scoped data, so its whole lifecycle runs on
	// PocketBase's own CRUD. Only fetching needs a route, because that reaches
	// out to the network.
	sources.ListRule = types.Pointer(ownerRule)
	sources.ViewRule = types.Pointer(ownerRule)
	sources.CreateRule = types.Pointer(`@request.auth.id != "" && @request.body.owner = @request.auth.id`)
	sources.UpdateRule = types.Pointer(ownerRule + ` && @request.body.owner:changed = false`)
	sources.DeleteRule = types.Pointer(ownerRule)
	sources.Fields.Add(
		&core.RelationField{Name: "owner", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.TextField{Name: "name", Required: true, Max: 100, Presentable: true},
		&core.SelectField{Name: "kind", Required: true, MaxSelect: 1, Values: []string{"rss", "github_trending"}},
		&core.TextField{Name: "url", Max: 2048},
		&core.JSONField{Name: "params", MaxSize: 4 * 1024},
		&core.BoolField{Name: "enabled"},
		&core.DateField{Name: "last_fetched_at"},
		&core.TextField{Name: "last_error", Max: 500},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	sources.AddIndex("idx_reading_sources_owner_name", true, "owner, name", "")
	if err := app.Save(sources); err != nil {
		return err
	}

	return seedPresetReadingSources(app, sources)
}

// seedPresetReadingSources gives every existing account the preset feeds. The
// owner relation is required, so a preset has to belong to someone; accounts
// created later are seeded by internal/reading.
func seedPresetReadingSources(app core.App, sources *core.Collection) error {
	userRecords, err := app.FindRecordsByFilter(usersCollectionName, "", "id", 0, 0)
	if err != nil {
		return err
	}
	for _, user := range userRecords {
		for _, preset := range presetReadingSources {
			record := core.NewRecord(sources)
			record.Set("owner", user.Id)
			record.Set("name", preset.Name)
			record.Set("kind", preset.Kind)
			record.Set("url", preset.URL)
			record.Set("params", preset.Params)
			record.Set("enabled", true)
			if err := app.Save(record); err != nil {
				return err
			}
		}
	}
	return nil
}

func dropReadingSourcesCollection(app core.App) error {
	collection, err := app.FindCollectionByNameOrId(readingSourcesCollection)
	if err != nil {
		return err
	}
	return app.Delete(collection)
}
