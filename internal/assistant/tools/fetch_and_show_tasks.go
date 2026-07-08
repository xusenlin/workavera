package tools

import (
	"context"
	"encoding/json"

	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/board"
)

type boardTasksInput struct {
	ProjectID string   `json:"projectId" description:"Project ID (required)"`
	StateIDs  []string `json:"stateIds,omitempty" description:"Optional list of state IDs to filter tasks by state"`
	UserIDs   []string `json:"userIds,omitempty" description:"Optional list of user IDs to filter tasks where any of these users are assignees"`
}

func newFetchAndShowTasksTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"fetch_and_show_tasks",
		"Fetch and display tasks for a board project, optionally filtered by one or more states or assignees. Returns task title, priority, due date, labels and assignees. The results are already displayed to the user as task cards grouped by state — do NOT repeat the task list in your reply, just give a brief one-sentence summary.",
		func(ctx context.Context, input boardTasksInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
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
