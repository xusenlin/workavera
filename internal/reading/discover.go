package reading

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const (
	discoverTimeout = 60 * time.Second
	maxCandidates   = 200
	userAgent       = "Workavera/1.0 (+https://github.com/xusenlin/workavera)"
)

// Candidate is one entry a subscription offered. Candidates are never stored:
// the panel holds them until the user keeps one, which then becomes an
// ordinary reading item.
type Candidate struct {
	SourceID     string `json:"sourceId"`
	SourceName   string `json:"sourceName"`
	Title        string `json:"title"`
	URL          string `json:"url"`
	Description  string `json:"description,omitempty"`
	PublishedAt  string `json:"publishedAt,omitempty"`
	Language     string `json:"language,omitempty"`
	Stars        int    `json:"stars,omitempty"`
	PeriodStars  int    `json:"periodStars,omitempty"`
	StarsPeriod  string `json:"starsPeriod,omitempty"`
	AlreadySaved bool   `json:"alreadySaved"`
}

// DiscoverFailure reports one subscription that could not be read. A failure
// is returned alongside the candidates rather than instead of them, so one
// broken feed does not empty the panel.
type DiscoverFailure struct {
	SourceID   string `json:"sourceId"`
	SourceName string `json:"sourceName"`
	Message    string `json:"message"`
}

type DiscoverResult struct {
	Items    []Candidate       `json:"items"`
	Failures []DiscoverFailure `json:"failures"`
}

type discoverRequest struct {
	SourceIDs []string `json:"sourceIds"`
}

type summarizeURLRequest struct {
	URL      string `json:"url"`
	Title    string `json:"title"`
	Language string `json:"language"`
}

func discoverItems(event *core.RequestEvent) error {
	var request discoverRequest
	if err := event.BindBody(&request); err != nil {
		return event.BadRequestError("Invalid discovery request.", err)
	}

	ctx, cancel := context.WithTimeout(event.Request.Context(), discoverTimeout)
	defer cancel()

	result, err := Discover(ctx, event.App, event.Auth.Id, request.SourceIDs)
	if err != nil {
		return event.BadRequestError(err.Error(), err)
	}
	return event.JSON(http.StatusOK, result)
}

func summarizeCandidate(event *core.RequestEvent) error {
	var request summarizeURLRequest
	if err := event.BindBody(&request); err != nil {
		return event.BadRequestError("Invalid summary request.", err)
	}

	ctx, cancel := context.WithTimeout(event.Request.Context(), 90*time.Second)
	defer cancel()

	result, err := SummarizeURL(ctx, event.App, event.Auth.Id, request.URL, request.Title, request.Language)
	if err != nil {
		return event.BadRequestError(err.Error(), err)
	}
	return event.JSON(http.StatusOK, summarizeResponse{
		ContentText: result.ContentText,
		Summary:     result.Summary,
		KeyPoints:   result.KeyPoints,
	})
}

// Discover reads the actor's enabled subscriptions, or the subset named by
// sourceIDs, and returns what they currently offer.
func Discover(ctx context.Context, app core.App, actorID string, sourceIDs []string) (DiscoverResult, error) {
	sources, err := loadSources(app, actorID, sourceIDs)
	if err != nil {
		return DiscoverResult{}, err
	}
	if len(sources) == 0 {
		return DiscoverResult{Items: []Candidate{}, Failures: []DiscoverFailure{}}, nil
	}

	type sourceResult struct {
		candidates []Candidate
		err        error
	}
	results := make([]sourceResult, len(sources))

	var group sync.WaitGroup
	for index, source := range sources {
		group.Add(1)
		go func() {
			defer group.Done()
			results[index].candidates, results[index].err = fetchSource(ctx, source)
		}()
	}
	group.Wait()

	items := make([]Candidate, 0, maxCandidates)
	failures := make([]DiscoverFailure, 0)
	seen := make(map[string]bool)
	for index, source := range sources {
		recordFetchOutcome(app, source.ID, results[index].err)
		if results[index].err != nil {
			failures = append(failures, DiscoverFailure{
				SourceID:   source.ID,
				SourceName: source.Name,
				Message:    results[index].err.Error(),
			})
			continue
		}
		for _, candidate := range results[index].candidates {
			key := canonicalURL(candidate.URL)
			if key == "" || seen[key] {
				continue
			}
			seen[key] = true
			items = append(items, candidate)
			if len(items) >= maxCandidates {
				break
			}
		}
	}

	// Trending rows arrive ranked by star gain; sorting the whole list by it
	// floats the strongest repositories above the dated feed entries, which
	// carry no gain at all and keep their own order underneath.
	sort.SliceStable(items, func(first, second int) bool {
		return items[first].PeriodStars > items[second].PeriodStars
	})

	if err := markAlreadySaved(app, actorID, items); err != nil {
		return DiscoverResult{}, err
	}
	return DiscoverResult{Items: items, Failures: failures}, nil
}

func fetchSource(ctx context.Context, source Source) ([]Candidate, error) {
	switch source.Kind {
	case KindRSS:
		return fetchFeedCandidates(ctx, source)
	case KindGitHubTrending:
		return fetchTrendingCandidates(ctx, source)
	}
	return nil, fmt.Errorf("unsupported source kind %q", source.Kind)
}

// markAlreadySaved flags the candidates whose link is in the reading list
// already, so a repeated fetch shows what is new instead of what was kept
// last time.
//
// The comparison happens here rather than in the query because a feed and a
// saved item routinely spell the same link differently, and matching those in
// SQL would mean guessing every spelling in advance. Reading only the url
// column keeps the scan cheap.
func markAlreadySaved(app core.App, actorID string, candidates []Candidate) error {
	if len(candidates) == 0 {
		return nil
	}

	records := []*core.Record{}
	err := app.RecordQuery(itemsCollection).
		Select("id", "url").
		AndWhere(dbx.HashExp{"owner": actorID}).
		All(&records)
	if err != nil {
		return err
	}

	saved := make(map[string]bool, len(records))
	for _, record := range records {
		saved[canonicalURL(record.GetString("url"))] = true
	}
	for index := range candidates {
		candidates[index].AlreadySaved = saved[canonicalURL(candidates[index].URL)]
	}
	return nil
}

// SummarizeURL fetches a page and summarizes it without storing anything, so
// a candidate can be read in the chosen language before it is kept.
func SummarizeURL(ctx context.Context, app core.App, actorID, rawURL, title, language string) (SummarizeResult, error) {
	if actorID == "" {
		return SummarizeResult{}, errors.New("missing actor")
	}

	content, err := fetchReadableText(ctx, rawURL)
	if err != nil {
		return SummarizeResult{}, fmt.Errorf("could not fetch the page content: %w", err)
	}

	model, err := findDefaultModel(app, actorID)
	if err != nil {
		return SummarizeResult{}, errors.New("the page was fetched, but no default model is configured")
	}
	if strings.TrimSpace(model.APIKey) == "" {
		return SummarizeResult{}, errors.New("the page was fetched, but the default model has no API key")
	}

	payload, err := summarizeContent(ctx, model, title, rawURL, content, language)
	if err != nil {
		return SummarizeResult{}, fmt.Errorf("the page was fetched, but summarization failed: %w", err)
	}
	return SummarizeResult{ContentText: content, Summary: payload.Summary, KeyPoints: payload.KeyPoints}, nil
}

// canonicalURL is the form two links are compared in. It only removes the
// differences that show up between a feed and a saved item, so links that
// genuinely differ stay distinct.
func canonicalURL(rawURL string) string {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Host == "" {
		return strings.TrimSpace(rawURL)
	}
	parsed.Scheme = strings.ToLower(parsed.Scheme)
	parsed.Host = strings.ToLower(parsed.Host)
	parsed.Path = strings.TrimSuffix(parsed.Path, "/")
	parsed.Fragment = ""
	return parsed.String()
}

// fetchBytes performs the one outbound GET the feature makes, capped so a
// large or endless response cannot exhaust memory.
func fetchBytes(ctx context.Context, endpoint, accept string, limit int64) ([]byte, string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, "", err
	}
	request.Header.Set("User-Agent", userAgent)
	if accept != "" {
		request.Header.Set("Accept", accept)
	}

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return nil, "", err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, "", fmt.Errorf("unexpected status %d", response.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(response.Body, limit))
	if err != nil {
		return nil, "", err
	}
	if len(data) == 0 {
		return nil, "", errors.New("empty response")
	}
	return data, strings.ToLower(response.Header.Get("Content-Type")), nil
}
