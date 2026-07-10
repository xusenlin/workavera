package tools

import (
	"context"
	"encoding/json"
	"strings"

	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/reading"
)

type readingSearchInput struct {
	Query     string `json:"query,omitempty" description:"Optional search text matched against title, url, description, and tags"`
	Status    string `json:"status,omitempty" description:"Optional status filter: unread, read, or archived"`
	ProjectID string `json:"projectId,omitempty" description:"Optional Board project ID to filter items by project"`
	Limit     int    `json:"limit,omitempty" description:"Maximum number of results, default 10, max 20"`
}

type readingUpsertInput struct {
	ID              string   `json:"id,omitempty" description:"Existing reading item ID. Omit to create a new item; provide to update an existing one."`
	URL             string   `json:"url,omitempty" description:"Article URL (required when creating)"`
	Title           *string  `json:"title,omitempty" description:"Article title. Required when creating; optional replacement when updating."`
	Description     *string  `json:"description,omitempty" description:"Optional description; pass an empty string to clear it"`
	Tags            *[]string `json:"tags,omitempty" description:"Optional tags for categorization"`
	Status          *string  `json:"status,omitempty" description:"Status: unread (default), read, or archived"`
	ProjectID       *string  `json:"projectId,omitempty" description:"Optional Board project ID to associate this item with a board project"`
	SummaryLanguage *string  `json:"summaryLanguage,omitempty" description:"Language for AI summary; default English"`
}

type readingGetInput struct {
	ID             string `json:"id" description:"Reading item ID (required)"`
	IncludeContent bool   `json:"includeContent,omitempty" description:"Whether to include the full article text; default false"`
}

type readingSummarizeInput struct {
	ID string `json:"id" description:"Reading item ID (required)"`
}

func newReadingSearchTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"reading_search",
		"Search and list the user's reading items by title, url, description, or tags. Returns summary and key points when available, but not the full article text.",
		func(ctx context.Context, input readingSearchInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := reading.Search(ctx, app, actorID, reading.SearchOptions{
				Query:     input.Query,
				Status:    input.Status,
				ProjectID: input.ProjectID,
				Limit:     input.Limit,
			})
			if err != nil {
				app.Logger().Error("assistant reading search tool failed", "actorId", actorID, "error", err)
				return fantasy.NewTextErrorResponse("Reading search is temporarily unavailable"), nil
			}
			data, err := json.Marshal(result)
			if err != nil {
				return fantasy.NewTextErrorResponse("Failed to serialize reading results"), nil
			}
			return fantasy.NewTextResponse(string(data)), nil
		},
	)
}

func newReadingUpsertTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"reading_upsert",
		"Create or update a reading item. Omit id to create a new item (url and title are required). Provide id to update an existing item; only non-nil fields change. Use to save links, mark items as read/archived, edit title, or update tags.",
		func(ctx context.Context, input readingUpsertInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			var (
				result reading.Item
				err    error
			)
			if input.ID == "" {
				result, err = reading.Create(ctx, app, actorID, reading.CreateInput{
					URL:             input.URL,
					Title:           deref(input.Title),
					Description:     derefOrEmpty(input.Description),
					Tags:            derefSlice(input.Tags),
					Status:          derefOrEmpty(input.Status),
					ProjectID:       derefOrEmpty(input.ProjectID),
					SummaryLanguage: derefOrEmpty(input.SummaryLanguage),
				})
			} else {
				result, err = reading.Update(ctx, app, actorID, input.ID, reading.UpdateInput{
					Title:           input.Title,
					Description:     input.Description,
					Tags:            input.Tags,
					Status:          input.Status,
					ProjectID:       input.ProjectID,
					SummaryLanguage: input.SummaryLanguage,
				})
			}
			if err != nil {
				app.Logger().Error("assistant reading upsert tool failed", "actorId", actorID, "error", err)
				return fantasy.NewTextErrorResponse("Failed to save reading item"), nil
			}
			data, err := json.Marshal(result)
			if err != nil {
				return fantasy.NewTextErrorResponse("Failed to serialize reading item"), nil
			}
			return fantasy.NewTextResponse(string(data)), nil
		},
	)
}

func newReadingGetTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"reading_get",
		"Get a single reading item by ID. Set includeContent=true to retrieve the full article text; otherwise only metadata, summary, and key points are returned.",
		func(ctx context.Context, input readingGetInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := reading.Get(ctx, app, actorID, input.ID, input.IncludeContent)
			if err != nil {
				app.Logger().Error("assistant reading get tool failed", "actorId", actorID, "error", err)
				return fantasy.NewTextErrorResponse("Reading item not found"), nil
			}
			data, err := json.Marshal(result)
			if err != nil {
				return fantasy.NewTextErrorResponse("Failed to serialize reading item"), nil
			}
			return fantasy.NewTextResponse(string(data)), nil
		},
	)
}

func newReadingSummarizeTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"reading_summarize",
		"Fetch the article content from a reading item's URL and generate a summary with key points using the user's default model. Requires a configured default model with an API key. If the item already has a summary, the existing summary is returned without re-summarizing.",
		func(ctx context.Context, input readingSummarizeInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			// Check for an existing summary first to avoid overwriting it.
			existing, err := reading.Get(ctx, app, actorID, input.ID, false)
			if err != nil {
				app.Logger().Error("assistant reading summarize tool failed", "actorId", actorID, "error", err)
				return fantasy.NewTextErrorResponse("Reading item not found"), nil
			}
			if strings.TrimSpace(existing.Summary) != "" {
				data, err := json.Marshal(existing)
				if err != nil {
					return fantasy.NewTextErrorResponse("Failed to serialize reading item"), nil
				}
				return fantasy.NewTextResponse(string(data)), nil
			}

			if _, err := reading.Summarize(ctx, app, actorID, input.ID); err != nil {
				app.Logger().Error("assistant reading summarize tool failed", "actorId", actorID, "error", err)
				return fantasy.NewTextErrorResponse(err.Error()), nil
			}

			// Return the updated item (without full content text) so the
			// response shape is consistent with the existing-summary path.
			updated, err := reading.Get(ctx, app, actorID, input.ID, false)
			if err != nil {
				return fantasy.NewTextErrorResponse("Failed to fetch reading item after summarization"), nil
			}
			data, err := json.Marshal(updated)
			if err != nil {
				return fantasy.NewTextErrorResponse("Failed to serialize reading item"), nil
			}
			return fantasy.NewTextResponse(string(data)), nil
		},
	)
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func derefOrEmpty(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func derefSlice(p *[]string) []string {
	if p == nil {
		return nil
	}
	return *p
}
