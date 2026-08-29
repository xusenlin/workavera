package reading

import (
	"strings"
	"testing"

	"golang.org/x/net/html"
)

const trendingFixture = `<!DOCTYPE html>
<html><body>
<div class="Box">
  <article class="Box-row">
    <h2 class="h3 lh-condensed">
      <a href="/pocketbase/pocketbase">
        <span class="text-normal">pocketbase /</span>
        pocketbase
      </a>
    </h2>
    <p class="col-9 color-fg-muted my-1 pr-4">
      Open Source realtime backend in 1 file
    </p>
    <div class="f6 color-fg-muted mt-2">
      <span class="d-inline-block ml-0 mr-3">
        <span itemprop="programmingLanguage">Go</span>
      </span>
      <a href="/pocketbase/pocketbase/stargazers" class="Link--muted d-inline-block mr-3">51,204</a>
      <a href="/pocketbase/pocketbase/forks" class="Link--muted d-inline-block mr-3">2,489</a>
      <a href="/sponsors/pocketbase" class="d-inline-block mr-3">Sponsor</a>
      <span class="d-inline-block float-sm-right">1,072 stars this week</span>
    </div>
  </article>
  <article class="Box-row">
    <h2 class="h3 lh-condensed">
      <a href="/owner/second?tab=readme">
        <span class="text-normal">owner /</span>
        second
      </a>
    </h2>
    <div class="f6 color-fg-muted mt-2">
      <a href="/owner/second/stargazers" class="Link--muted d-inline-block mr-3">318</a>
    </div>
  </article>
</div>
</body></html>`

func TestParseTrendingReadsRepositoryRows(t *testing.T) {
	document, err := html.Parse(strings.NewReader(trendingFixture))
	if err != nil {
		t.Fatal(err)
	}

	repos := parseTrending(document)
	if len(repos) != 2 {
		t.Fatalf("expected 2 repositories, got %d", len(repos))
	}

	first := repos[0]
	if first.Path != "pocketbase/pocketbase" {
		t.Fatalf("unexpected path: %q", first.Path)
	}
	if first.Description != "Open Source realtime backend in 1 file" {
		t.Fatalf("unexpected description: %q", first.Description)
	}
	if first.Language != "Go" {
		t.Fatalf("unexpected language: %q", first.Language)
	}
	if first.Stars != 51204 {
		t.Fatalf("unexpected star total: %d", first.Stars)
	}
	// The star gain over the period is the number the board exists for.
	if first.PeriodStars != 1072 {
		t.Fatalf("unexpected star gain: %d", first.PeriodStars)
	}

	// A row is read from its heading link, so the owner's sponsor page in the
	// first row is not mistaken for a repository, and a query string in the
	// second row's link is dropped. Rows without a description or a gain still
	// come through.
	second := repos[1]
	if second.Path != "owner/second" {
		t.Fatalf("unexpected path: %q", second.Path)
	}
	if second.Description != "" || second.PeriodStars != 0 || second.Stars != 318 {
		t.Fatalf("unexpected sparse row: %#v", second)
	}
}

func TestParseTrendingIgnoresUnrelatedMarkup(t *testing.T) {
	document, err := html.Parse(strings.NewReader(`<html><body><article class="Box-row"><p>No heading link here</p></article></body></html>`))
	if err != nil {
		t.Fatal(err)
	}
	if repos := parseTrending(document); len(repos) != 0 {
		t.Fatalf("expected no repositories, got %#v", repos)
	}
}

func TestLeadingCountReadsFormattedNumbers(t *testing.T) {
	for value, expected := range map[string]int{
		"1,072 stars this week": 1072,
		"51,204":                51204,
		"318":                   318,
		"Built by":              0,
		"":                      0,
	} {
		if count := leadingCount(value); count != expected {
			t.Fatalf("leadingCount(%q) = %d, want %d", value, count, expected)
		}
	}
}
