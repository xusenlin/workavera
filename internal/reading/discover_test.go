package reading

import (
	"net/url"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestCanonicalURLCollapsesEquivalentLinks(t *testing.T) {
	same := []string{
		"https://github.com/owner/repo",
		"https://github.com/owner/repo/",
		"https://GitHub.com/owner/repo#readme",
	}
	first := canonicalURL(same[0])
	for _, value := range same[1:] {
		if canonicalURL(value) != first {
			t.Fatalf("canonicalURL(%q) = %q, want %q", value, canonicalURL(value), first)
		}
	}

	// Links that genuinely differ must stay distinct, or a fetch would hide
	// candidates the user has never seen.
	if canonicalURL("https://example.com/a?page=1") == canonicalURL("https://example.com/a?page=2") {
		t.Fatal("query strings must not be collapsed")
	}
	if canonicalURL("https://example.com/a") == canonicalURL("https://example.com/b") {
		t.Fatal("distinct paths must not be collapsed")
	}
}

func TestGithubReadmeURLOnlyMapsRepositoryPages(t *testing.T) {
	for raw, expected := range map[string]string{
		"https://github.com/owner/repo":                    "https://raw.githubusercontent.com/owner/repo/HEAD/README.md",
		"https://github.com/owner/repo/releases/tag/v1":    "",
		"https://github.com/owner":                         "",
		"https://example.com/owner/repo":                   "",
		"https://raw.githubusercontent.com/owner/repo/x/y": "",
	} {
		parsed, err := url.Parse(raw)
		if err != nil {
			t.Fatal(err)
		}
		if readme := githubReadmeURL(parsed); readme != expected {
			t.Fatalf("githubReadmeURL(%q) = %q, want %q", raw, readme, expected)
		}
	}
}

func TestMarkAlreadySavedMatchesLinksAcrossSpellings(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	collection := core.NewBaseCollection(itemsCollection)
	collection.Fields.Add(&core.TextField{Name: "owner", Required: true})
	collection.Fields.Add(&core.TextField{Name: "url", Required: true})
	if err := app.Save(collection); err != nil {
		t.Fatal(err)
	}

	const owner = "test-owner"
	// The stored link carries a trailing slash the feed does not, which is the
	// difference a saved item and a feed entry most often disagree on.
	createTestItem(t, app, collection, owner, "https://github.com/owner/kept/")
	createTestItem(t, app, collection, "other-owner", "https://github.com/owner/theirs")

	candidates := []Candidate{
		{URL: "https://github.com/owner/kept"},
		{URL: "https://github.com/owner/fresh"},
		{URL: "https://github.com/owner/theirs"},
	}
	if err := markAlreadySaved(app, owner, candidates); err != nil {
		t.Fatal(err)
	}

	if !candidates[0].AlreadySaved {
		t.Fatal("a link already in the reading list must be marked as saved")
	}
	if candidates[1].AlreadySaved {
		t.Fatal("an unseen link must stay unmarked")
	}
	// Another account's reading list must never mask a candidate.
	if candidates[2].AlreadySaved {
		t.Fatal("another owner's item must not mark a candidate as saved")
	}
}

func createTestItem(t *testing.T, app core.App, collection *core.Collection, ownerID, rawURL string) {
	t.Helper()
	record := core.NewRecord(collection)
	record.Set("owner", ownerID)
	record.Set("url", rawURL)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
}
