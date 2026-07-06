package board

import (
	"context"
	"errors"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const MaxProjectSearchResults = 20

type ProjectSearchOptions struct {
	Query           string
	IncludeArchived bool
	Limit           int
}

type ProjectSummary struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Archived    bool   `json:"archived"`
}

// SearchVisibleProjects centralizes the same owner-or-member visibility rule
// used by the Board API. Agent tools call this domain query instead of
// duplicating collection authorization logic.
func SearchVisibleProjects(ctx context.Context, app core.App, actorID string, options ProjectSearchOptions) ([]ProjectSummary, error) {
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
	if limit > MaxProjectSearchResults {
		limit = MaxProjectSearchResults
	}

	clauses := []string{"(owner = {:actor} || board_project_members_via_project.user ?= {:actor})"}
	params := dbx.Params{"actor": actorID}
	if !options.IncludeArchived {
		clauses = append(clauses, "archived = false")
	}
	if query := strings.TrimSpace(options.Query); query != "" {
		clauses = append(clauses, "name ~ {:query}")
		params["query"] = query
	}

	records, err := app.FindRecordsByFilter(boardProjectsCollection, strings.Join(clauses, " && "), "-updated", limit, 0, params)
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	result := make([]ProjectSummary, 0, len(records))
	for _, record := range records {
		result = append(result, ProjectSummary{
			ID:          record.Id,
			Name:        record.GetString("name"),
			Description: record.GetString("description"),
			Archived:    record.GetBool("archived"),
		})
	}
	return result, nil
}
