package resources

import (
	"context"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	defaultListLimit = 20
	maxListLimit     = 50
	maxQueryChars    = 200
)

var summaryColumns = []string{"id", "display_name", "original_name", "media_type", "size", "created", "updated"}

type summaryRow struct {
	ID           string         `db:"id"`
	DisplayName  string         `db:"display_name"`
	OriginalName string         `db:"original_name"`
	MediaType    string         `db:"media_type"`
	Size         int64          `db:"size"`
	Created      types.DateTime `db:"created"`
	Updated      types.DateTime `db:"updated"`
}

// ResourceRef identifies a resource in download lease results.
type ResourceRef struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	MediaType string `json:"mediaType,omitempty"`
}

// ListItem is one resource in a resources_list result.
type ListItem struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	MediaType string `json:"mediaType"`
	Size      int64  `json:"size"`
	Created   string `json:"created"`
	Updated   string `json:"updated"`
}

type ListResult struct {
	Query     string     `json:"query,omitempty"`
	Resources []ListItem `json:"resources"`
	Truncated bool       `json:"truncated"`
}

// List returns the owner's resources, newest first. With a query it matches
// display_name and original_name using a literal, case-insensitive LIKE.
func List(ctx context.Context, app core.App, ownerID, query string, limit int) (ListResult, error) {
	if err := ctx.Err(); err != nil {
		return ListResult{}, err
	}
	query = strings.TrimSpace(query)
	if utf8.RuneCountInString(query) > maxQueryChars {
		return ListResult{}, newError(CodeInvalidInput, http.StatusBadRequest, "The query must be at most 200 characters.")
	}
	if limit <= 0 {
		limit = defaultListLimit
	}
	limit = min(limit, maxListLimit)
	result := ListResult{Query: query, Resources: []ListItem{}}

	var condition dbx.Expression
	if query != "" {
		pattern := "%" + escapeLike(query) + "%"
		condition = dbx.NewExp(`(display_name LIKE {:pattern} ESCAPE '\' OR original_name LIKE {:pattern} ESCAPE '\')`, dbx.Params{"pattern": pattern})
	}
	rows, err := listRows(app, ownerID, condition, limit+1)
	if err != nil {
		return ListResult{}, err
	}
	result.Truncated = len(rows) > limit
	result.Resources = appendItems(result.Resources, rows[:min(len(rows), limit)])
	return result, nil
}

func listRows(app core.App, ownerID string, condition dbx.Expression, limit int) ([]summaryRow, error) {
	rows := []summaryRow{}
	if limit <= 0 {
		return rows, nil
	}
	query := app.DB().Select(summaryColumns...).From(CollectionName).Where(dbx.HashExp{"owner": ownerID})
	if condition != nil {
		query = query.AndWhere(condition)
	}
	err := query.OrderBy("updated DESC", "id DESC").Limit(int64(limit)).All(&rows)
	return rows, err
}

func appendItems(items []ListItem, rows []summaryRow) []ListItem {
	for _, row := range rows {
		items = append(items, ListItem{
			ID:        row.ID,
			Name:      row.DisplayName,
			MediaType: row.MediaType,
			Size:      row.Size,
			Created:   formatTime(row.Created),
			Updated:   formatTime(row.Updated),
		})
	}
	return items
}

func formatTime(value types.DateTime) string {
	return value.Time().UTC().Format(time.RFC3339)
}

func escapeLike(value string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(value)
}

// Snapshot is the display data a chat message keeps for an attached resource.
// It is built from the stored record, never from client input.
type Snapshot struct {
	ResourceID string
	Name       string
	MediaType  string
	Size       int64
}

// Snapshots resolves the owner's resources by ID, in the order given. Any ID
// that does not name one of the owner's resources fails the whole call.
func Snapshots(app core.App, ownerID string, ids []string) ([]Snapshot, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	values := make([]any, 0, len(ids))
	for _, id := range ids {
		values = append(values, id)
	}
	rows := []summaryRow{}
	err := app.DB().Select(summaryColumns...).From(CollectionName).
		Where(dbx.HashExp{"owner": ownerID}).
		AndWhere(dbx.In("id", values...)).
		All(&rows)
	if err != nil {
		return nil, err
	}
	byID := make(map[string]summaryRow, len(rows))
	for _, row := range rows {
		byID[row.ID] = row
	}
	snapshots := make([]Snapshot, 0, len(ids))
	for _, id := range ids {
		row, ok := byID[id]
		if !ok {
			return nil, errNotFound
		}
		snapshots = append(snapshots, Snapshot{ResourceID: row.ID, Name: row.DisplayName, MediaType: row.MediaType, Size: row.Size})
	}
	return snapshots, nil
}
