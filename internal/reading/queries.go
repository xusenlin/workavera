package reading

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const MaxSearchResults = 20

// SearchOptions controls the reading item query.
type SearchOptions struct {
	Query     string
	Status    string
	ProjectID string
	Limit     int
}

// ItemSummary is the lightweight projection returned by Search. It excludes
// content_text to avoid large payloads in tool results.
type ItemSummary struct {
	ID              string   `json:"id"`
	Title           string   `json:"title"`
	URL             string   `json:"url"`
	Description     string   `json:"description,omitempty"`
	ProjectID       string   `json:"projectId,omitempty"`
	Status          string   `json:"status"`
	Summary         string   `json:"summary,omitempty"`
	KeyPoints       []string `json:"keyPoints,omitempty"`
	Tags            []string `json:"tags,omitempty"`
	SummaryLanguage string   `json:"summaryLanguage,omitempty"`
}

// Search returns the reading items owned by an authenticated user, optionally
// filtered by a fuzzy query and status. Agent tools call this domain query
// instead of duplicating collection authorization logic.
func Search(ctx context.Context, app core.App, actorID string, options SearchOptions) ([]ItemSummary, error) {
	if actorID == "" {
		return nil, errors.New("missing actor")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if _, err := app.FindRecordById("users", actorID); err != nil {
		return nil, errors.New("actor is not an active user")
	}

	limit := options.Limit
	if limit <= 0 {
		limit = 10
	}
	if limit > MaxSearchResults {
		limit = MaxSearchResults
	}

	clauses := []string{"owner = {:owner}"}
	params := dbx.Params{"owner": actorID}
	if query := strings.TrimSpace(options.Query); query != "" {
		clauses = append(clauses, "(title ~ {:query} || url ~ {:query} || description ~ {:query} || tags ~ {:query})")
		params["query"] = query
	}
	if status := strings.TrimSpace(options.Status); status != "" {
		clauses = append(clauses, "status = {:status}")
		params["status"] = status
	}
	if projectID := strings.TrimSpace(options.ProjectID); projectID != "" {
		clauses = append(clauses, "project = {:project}")
		params["project"] = projectID
	}

	records, err := app.FindRecordsByFilter(itemsCollection, strings.Join(clauses, " && "), "-updated", limit, 0, params)
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	result := make([]ItemSummary, 0, len(records))
	for _, record := range records {
		result = append(result, itemSummaryForRecord(record))
	}
	return result, nil
}

func itemSummaryForRecord(record *core.Record) ItemSummary {
	return ItemSummary{
		ID:              record.Id,
		Title:           record.GetString("title"),
		URL:             record.GetString("url"),
		Description:     record.GetString("description"),
		ProjectID:       record.GetString("project"),
		Status:          record.GetString("status"),
		Summary:         record.GetString("summary"),
		KeyPoints:       stringArray(record.Get("key_points")),
		Tags:            stringArray(record.Get("tags")),
		SummaryLanguage: record.GetString("summary_language"),
	}
}

func stringArray(value any) []string {
	if value == nil {
		return nil
	}

	// Marshal then unmarshal handles all PocketBase JSON field types
	// (types.JSONRaw, []byte, []any, []string, etc.) uniformly.
	data, err := json.Marshal(value)
	if err != nil {
		return nil
	}
	var items []string
	if err := json.Unmarshal(data, &items); err != nil {
		return nil
	}
	result := make([]string, 0, len(items))
	for _, item := range items {
		if s := strings.TrimSpace(item); s != "" {
			result = append(result, s)
		}
	}
	return result
}
