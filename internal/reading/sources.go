package reading

import (
	"encoding/json"
	"errors"
	"net/url"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

const sourcesCollection = "reading_sources"

// presetSources are the feeds a new account starts with, so the discovery
// panel has something to fetch before the user has added anything.
//
// The migration that created the collection seeded the accounts that existed
// then; this list serves the ones created later. Both must stay in step by
// hand, because a migration is frozen history and cannot read this list.
var presetSources = []struct {
	Name   string
	Kind   string
	URL    string
	Params map[string]any
}{
	{Name: "GitHub Trending · Go", Kind: KindGitHubTrending, Params: map[string]any{"language": "go", "since": "weekly"}},
	{Name: "GitHub Trending · Rust", Kind: KindGitHubTrending, Params: map[string]any{"language": "rust", "since": "weekly"}},
	{Name: "GitHub Trending · TypeScript", Kind: KindGitHubTrending, Params: map[string]any{"language": "typescript", "since": "weekly"}},
	{Name: "Hacker News Front Page", Kind: KindRSS, URL: "https://hnrss.org/frontpage", Params: map[string]any{}},
}

// The kinds a subscription can have. Every third-party feed the user pastes in
// is an RSS or Atom document, including the release feed of a repository they
// follow; GitHub trending is the one source with no feed to subscribe to.
const (
	KindRSS            = "rss"
	KindGitHubTrending = "github_trending"
)

// Source is a decoded reading_sources record.
type Source struct {
	ID       string
	Name     string
	Kind     string
	URL      string
	Language string
	Since    string
}

type sourceParams struct {
	Language string `json:"language"`
	Since    string `json:"since"`
}

// SeedPresets gives an account the preset feeds. Presets are a convenience,
// so a caller that fails here should log rather than fail the account.
func SeedPresets(app core.App, ownerID string) error {
	collection, err := app.FindCollectionByNameOrId(sourcesCollection)
	if err != nil {
		return err
	}
	for _, preset := range presetSources {
		record := core.NewRecord(collection)
		record.Set("owner", ownerID)
		record.Set("name", preset.Name)
		record.Set("kind", preset.Kind)
		record.Set("url", preset.URL)
		record.Set("params", preset.Params)
		record.Set("enabled", true)
		if err := app.Save(record); err != nil {
			return err
		}
	}
	return nil
}

// validateSourceRequest rejects a subscription that could never be fetched.
// The collection rules already keep a source to its owner; this only covers
// the part of the shape that depends on the kind.
func validateSourceRequest(event *core.RecordRequestEvent) error {
	switch event.Record.GetString("kind") {
	case KindRSS:
		if _, err := feedURL(event.Record.GetString("url")); err != nil {
			return event.BadRequestError("An RSS source needs an http or https feed URL.", err)
		}
	case KindGitHubTrending:
		if decodeSourceParams(event.Record).Language == "" {
			return event.BadRequestError("A GitHub trending source needs a language.", nil)
		}
	}
	return event.Next()
}

// loadSources returns the actor's enabled sources, narrowed to sourceIDs when
// the caller asked for a subset.
func loadSources(app core.App, actorID string, sourceIDs []string) ([]Source, error) {
	if actorID == "" {
		return nil, errors.New("missing actor")
	}

	records, err := app.FindRecordsByFilter(
		sourcesCollection,
		"owner = {:owner} && enabled = true",
		"name",
		0,
		0,
		dbx.Params{"owner": actorID},
	)
	if err != nil {
		return nil, err
	}

	wanted := make(map[string]bool, len(sourceIDs))
	for _, id := range sourceIDs {
		if id = strings.TrimSpace(id); id != "" {
			wanted[id] = true
		}
	}

	sources := make([]Source, 0, len(records))
	for _, record := range records {
		if len(wanted) > 0 && !wanted[record.Id] {
			continue
		}
		params := decodeSourceParams(record)
		since := params.Since
		if since != "daily" && since != "weekly" && since != "monthly" {
			since = "weekly"
		}
		sources = append(sources, Source{
			ID:       record.Id,
			Name:     record.GetString("name"),
			Kind:     record.GetString("kind"),
			URL:      strings.TrimSpace(record.GetString("url")),
			Language: strings.TrimSpace(params.Language),
			Since:    since,
		})
	}
	return sources, nil
}

// recordFetchOutcome keeps the last attempt visible on the source itself, so a
// feed that has started failing says so in the panel instead of silently
// contributing nothing.
func recordFetchOutcome(app core.App, sourceID string, fetchErr error) {
	record, err := app.FindRecordById(sourcesCollection, sourceID)
	if err != nil {
		return
	}
	record.Set("last_fetched_at", types.NowDateTime())
	message := ""
	if fetchErr != nil {
		message = fetchErr.Error()
		if len(message) > 500 {
			message = message[:500]
		}
	}
	record.Set("last_error", message)
	if err := app.Save(record); err != nil {
		app.Logger().Error("could not record reading source fetch outcome", "sourceId", sourceID, "error", err)
	}
}

func decodeSourceParams(record *core.Record) sourceParams {
	data, err := json.Marshal(record.Get("params"))
	if err != nil {
		return sourceParams{}
	}
	var params sourceParams
	if err := json.Unmarshal(data, &params); err != nil {
		return sourceParams{}
	}
	return params
}

func feedURL(rawURL string) (*url.URL, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return nil, err
	}
	if parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return nil, errors.New("only http and https feed URLs are supported")
	}
	return parsed, nil
}
