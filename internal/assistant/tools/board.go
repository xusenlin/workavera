package tools

import (
	"context"
	"encoding/json"

	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/board"
)

type boardProjectsInput struct {
	Query           string `json:"query,omitempty" description:"Filter by project name"`
	IncludeArchived bool   `json:"includeArchived,omitempty" description:"Whether to include archived projects, defaults to false"`
	Limit           int    `json:"limit,omitempty" description:"Maximum number of results, default 10, max 20"`
}

func newBoardProjectsTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"show_board_projects",
		"Search board projects owned by or visible to the current user, including project states and task counts per state. The results are already displayed to the user as project cards — do NOT repeat the project list in your reply, just give a brief one-sentence summary.",
		func(ctx context.Context, input boardProjectsInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := board.SearchVisibleProjects(ctx, app, actorID, board.ProjectSearchOptions{
				Query:           input.Query,
				IncludeArchived: input.IncludeArchived,
				Limit:           input.Limit,
			})
			if err != nil {
				app.Logger().Error("assistant board projects tool failed", "actorId", actorID, "error", err)
				return fantasy.NewTextErrorResponse("Board projects search is temporarily unavailable"), nil
			}
			data, err := json.Marshal(result)
			if err != nil {
				return fantasy.NewTextErrorResponse("Failed to serialize board projects results"), nil
			}
			return fantasy.NewTextResponse(string(data)), nil
		},
	)
}
