package contacts

import (
	"context"
	"errors"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const MaxSearchResults = 20

type SearchOptions struct {
	Query string
	Limit int
}

type Summary struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Title  string `json:"title,omitempty"`
	Status string `json:"status,omitempty"`
}

// Search returns the bounded, non-sensitive contact projection available to
// an authenticated user. Phone numbers and other profile details are excluded
// because tool results are forwarded to the selected external model.
func Search(ctx context.Context, app core.App, actorID string, options SearchOptions) ([]Summary, error) {
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

	query := strings.TrimSpace(options.Query)
	filter := "id != ''"
	params := dbx.Params{}
	if query != "" {
		filter = "name ~ {:query} || title ~ {:query}"
		params["query"] = query
	}
	records, err := app.FindRecordsByFilter("users", filter, "name", limit, 0, params)
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	result := make([]Summary, 0, len(records))
	for _, record := range records {
		result = append(result, Summary{
			ID:     record.Id,
			Name:   record.GetString("name"),
			Title:  record.GetString("title"),
			Status: record.GetString("status"),
		})
	}
	return result, nil
}
