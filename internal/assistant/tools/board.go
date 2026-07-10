package tools

import (
	"context"
	"encoding/json"

	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/board"
)

type boardSearchProjectsInput struct {
	Query           string   `json:"query,omitempty" description:"Filter by project name"`
	IncludeArchived bool     `json:"includeArchived,omitempty" description:"Whether to include archived projects, defaults to false"`
	Limit           int      `json:"limit,omitempty" description:"Maximum number of results, default 10, max 20"`
	UserIDs         []string `json:"userIds,omitempty" description:"Optional list of user IDs to filter projects that have tasks assigned to any of these users"`
}

type boardSearchTasksInput struct {
	ProjectID string   `json:"projectId" description:"Project ID (required)"`
	StateIDs  []string `json:"stateIds,omitempty" description:"Optional list of state IDs to filter tasks by state"`
	UserIDs   []string `json:"userIds,omitempty" description:"Optional list of user IDs to filter tasks where any of these users are assignees"`
}

func newBoardSearchProjectsTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"board_search_projects",
		"Fetch and display board projects owned by or visible to the current user, including project states and task counts per state. Optionally filter by assignee user IDs.",
		func(ctx context.Context, input boardSearchProjectsInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := board.SearchVisibleProjects(ctx, app, actorID, board.ProjectSearchOptions{
				Query:           input.Query,
				IncludeArchived: input.IncludeArchived,
				Limit:           input.Limit,
				UserIDs:         input.UserIDs,
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

func newBoardSearchTasksTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"board_search_tasks",
		"Fetch and display tasks for a board project, optionally filtered by states or assignees.",
		func(ctx context.Context, input boardSearchTasksInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := board.SearchVisibleTasks(ctx, app, actorID, board.TaskSearchOptions{
				ProjectID: input.ProjectID,
				StateIDs:  input.StateIDs,
				UserIDs:   input.UserIDs,
			})
			if err != nil {
				app.Logger().Error("assistant tasks tool failed", "actorId", actorID, "error", err)
				return fantasy.NewTextErrorResponse("Board tasks search is temporarily unavailable"), nil
			}
			data, err := json.Marshal(result)
			if err != nil {
				return fantasy.NewTextErrorResponse("Failed to serialize board tasks results"), nil
			}
			return fantasy.NewTextResponse(string(data)), nil
		},
	)
}
