package tools

import (
	"context"
	"encoding/json"

	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/contacts"
)

type contactsSearchInput struct {
	Query string `json:"query,omitempty" description:"Filter by name or title; leave empty to return the first few contacts"`
	Limit int    `json:"limit,omitempty" description:"Maximum number of results, default 10, max 20"`
}

func newContactsSearchTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"contacts_search",
		"Fetch and display team contacts visible to the current user with fuzzy matching by name or title.",
		func(ctx context.Context, input contactsSearchInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := contacts.Search(ctx, app, actorID, contacts.SearchOptions{Query: input.Query, Limit: input.Limit})
			if err != nil {
				app.Logger().Error("assistant contacts tool failed", "actorId", actorID, "error", err)
				return fantasy.NewTextErrorResponse("Contacts search is temporarily unavailable"), nil
			}
			data, err := json.Marshal(result)
			if err != nil {
				return fantasy.NewTextErrorResponse("Failed to serialize contacts results"), nil
			}
			return fantasy.NewTextResponse(string(data)), nil
		},
	)
}
