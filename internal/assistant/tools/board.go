package tools

import (
	"context"
	"encoding/json"

	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"
	workagent "github.com/xusenlin/workavera/internal/agent"
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

type boardGetProjectInput struct {
	ID string `json:"id" description:"Project ID (required)"`
}

type boardCreateProjectInput struct {
	Name        string `json:"name" description:"Project name"`
	Description string `json:"description,omitempty" description:"Optional project description"`
	TemplateID  string `json:"templateId,omitempty" description:"Optional template ID from board_list_templates; omit for a blank project"`
}

type boardUpdateProjectInput struct {
	ProjectID   string  `json:"projectId" description:"Project ID; current user must be its owner"`
	Name        *string `json:"name,omitempty" description:"Optional replacement project name"`
	Description *string `json:"description,omitempty" description:"Optional replacement description; pass an empty string to clear it"`
}

type boardUpsertStateItem struct {
	StateID   string   `json:"stateId,omitempty" description:"Existing state ID to update; omit to create"`
	Name      *string  `json:"name,omitempty" description:"State name; required when creating"`
	Color     *string  `json:"color,omitempty" description:"State color such as #3b82f6; required when creating"`
	Category  *string  `json:"category,omitempty" description:"State category: pending, active, or completed; required when creating"`
	SortOrder *float64 `json:"sortOrder,omitempty" description:"Optional ordering value. Omit it to append the state to the end automatically (recommended). Only set it to place the state at a specific position, using the sortOrder values from board_get_project as reference (e.g. a value between two existing states); never guess small numbers like 1 or negatives."`
}

type boardUpsertStateInput struct {
	ProjectID string                 `json:"projectId" description:"Project ID; current user must be its owner"`
	Items     []boardUpsertStateItem `json:"items" description:"One to 50 workflow states to create or update"`
}

type boardUpsertLabelItem struct {
	LabelID string  `json:"labelId,omitempty" description:"Existing label ID to update; omit to create"`
	Name    *string `json:"name,omitempty" description:"Label name; required when creating"`
	Color   *string `json:"color,omitempty" description:"Label color such as #3b82f6; required when creating"`
}

type boardUpsertLabelInput struct {
	ProjectID string                 `json:"projectId" description:"Project ID; current user must be its owner"`
	Items     []boardUpsertLabelItem `json:"items" description:"One to 50 labels to create or update"`
}

type boardUpsertMemberItem struct {
	UserID string `json:"userId" description:"Active user ID to add or update"`
	Role   string `json:"role" description:"Member role: admin, member, or viewer"`
}

type boardUpsertMemberInput struct {
	ProjectID string                  `json:"projectId" description:"Project ID; current user must be its owner"`
	Items     []boardUpsertMemberItem `json:"items" description:"One to 50 project members to add or update"`
}

type boardCreateTaskItem struct {
	StateID     string   `json:"stateId" description:"State ID belonging to the project"`
	Title       string   `json:"title" description:"Task title"`
	Description string   `json:"description,omitempty" description:"Optional task description"`
	Priority    string   `json:"priority,omitempty" description:"Priority: none, low, medium, high, or urgent; defaults to medium"`
	DueDate     string   `json:"dueDate,omitempty" description:"Optional due date in YYYY-MM-DD format"`
	LabelIDs    []string `json:"labelIds,omitempty" description:"Optional label IDs belonging to the project"`
	AssigneeIDs []string `json:"assigneeIds,omitempty" description:"Optional user IDs; each must be the project owner or a member"`
	DocumentIDs []string `json:"documentIds,omitempty" description:"Optional document IDs to link; each must belong to the same project"`
}

type boardCreateTaskInput struct {
	ProjectID string                `json:"projectId" description:"Project ID where the current user can edit tasks"`
	Items     []boardCreateTaskItem `json:"items" description:"One to 50 tasks to create"`
}

type boardUpdateTaskItem struct {
	TaskID      string    `json:"taskId" description:"Task ID"`
	Title       *string   `json:"title,omitempty" description:"Optional replacement title"`
	Description *string   `json:"description,omitempty" description:"Optional replacement description; pass an empty string to clear it"`
	StateID     *string   `json:"stateId,omitempty" description:"Optional state ID belonging to the same project"`
	Priority    *string   `json:"priority,omitempty" description:"Optional priority: none, low, medium, high, or urgent"`
	DueDate     *string   `json:"dueDate,omitempty" description:"Optional due date in YYYY-MM-DD format; pass null to clear it"`
	LabelIDs    *[]string `json:"labelIds,omitempty" description:"Optional replacement label IDs; pass an empty array to clear"`
	AssigneeIDs *[]string `json:"assigneeIds,omitempty" description:"Optional replacement assignee user IDs; pass an empty array to clear"`
	DocumentIDs *[]string `json:"documentIds,omitempty" description:"Optional replacement linked document IDs, each belonging to the same project; pass an empty array to clear"`
	dueDateSet  bool
}

type boardUpdateTaskInput struct {
	Items []boardUpdateTaskItem `json:"items" description:"One to 50 task patches"`
}

type boardDeleteTaskInput struct {
	TaskID string `json:"taskId" description:"Task ID returned by board_search_tasks"`
}

func (input *boardUpdateTaskItem) UnmarshalJSON(data []byte) error {
	type alias boardUpdateTaskItem
	var decoded alias
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	*input = boardUpdateTaskItem(decoded)
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}
	_, input.dueDateSet = fields["dueDate"]
	return nil
}

func newBoardSearchProjectsTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"board_search_projects",
		"Fetch Board projects visible to the current user, including owner, currentActorRole, capabilities, states, and task counts. Optionally filter by assignee user IDs. Use board_get_project for IDs required by mutations.",
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
		"Fetch and display tasks for a board project, optionally filtered by states or assignees. Each task includes any linked documents (id and title); call docs_get with a document id to read its content when relevant.",
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

func newBoardGetProjectTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"board_get_project",
		"Get a visible Board project with owner, members, participants, states, labels, task counts, currentActorRole, and capabilities. Call this before changing an existing project or task and never guess returned IDs.",
		func(ctx context.Context, input boardGetProjectInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := board.GetVisibleProject(ctx, app, actorID, input.ID)
			if err != nil {
				app.Logger().Error("assistant board get project tool failed", "actorId", actorID, "error", err)
				return fantasy.NewTextErrorResponse("Board project not found"), nil
			}
			data, err := json.Marshal(result)
			if err != nil {
				return fantasy.NewTextErrorResponse("Failed to serialize board project"), nil
			}
			return fantasy.NewTextResponse(string(data)), nil
		},
	)
}

func newBoardListTemplatesTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"board_list_templates",
		"List Board project templates. Use this before board_create_project when the user wants a template; omit templateId to create a blank project.",
		func(ctx context.Context, _ struct{}, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := board.ListVisibleTemplates(ctx, app, actorID)
			return boardToolResult(app, actorID, "list templates", result, err)
		},
	)
}

func newBoardCreateProjectTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"board_create_project",
		"Create a Board project owned by the current user, either blank or from a template returned by board_list_templates. This tool never deletes resources.",
		func(ctx context.Context, input boardCreateProjectInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := board.CreateProject(ctx, app, actorID, board.CreateProjectCommand{Name: input.Name, Description: normalizeEscapedText(input.Description), TemplateID: input.TemplateID})
			return boardToolResult(app, actorID, "create project", result, err)
		},
	)
}

func newBoardUpdateProjectTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"board_update_project",
		"Update a project name or description. Call board_get_project first and only use when capabilities.canEditProject is true. Server authorization requires the current user to be the owner.",
		func(ctx context.Context, input boardUpdateProjectInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := board.UpdateProject(ctx, app, actorID, board.UpdateProjectCommand{ProjectID: input.ProjectID, Name: input.Name, Description: normalizeEscapedTextPtr(input.Description)})
			return boardToolResult(app, actorID, "update project", result, err)
		},
	)
}

func newBoardUpsertStateTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"board_upsert_state",
		"Create or update a project workflow state. Call board_get_project first and only use when capabilities.canManageWorkflow is true. Omit stateId to create; this tool cannot delete states.",
		func(ctx context.Context, input boardUpsertStateInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := executeBatch(input.Items, func(_ int, item boardUpsertStateItem) (any, error) {
				return board.UpsertState(ctx, app, actorID, board.UpsertStateCommand{ProjectID: input.ProjectID, StateID: item.StateID, Name: item.Name, Color: item.Color, Category: item.Category, SortOrder: item.SortOrder})
			})
			return batchToolResponse(result, err)
		},
	)
}

func newBoardUpsertLabelTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"board_upsert_label",
		"Create or update a project label. Call board_get_project first and only use when capabilities.canManageWorkflow is true. Omit labelId to create; this tool cannot delete labels.",
		func(ctx context.Context, input boardUpsertLabelInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := executeBatch(input.Items, func(_ int, item boardUpsertLabelItem) (any, error) {
				return board.UpsertLabel(ctx, app, actorID, board.UpsertLabelCommand{ProjectID: input.ProjectID, LabelID: item.LabelID, Name: item.Name, Color: item.Color})
			})
			return batchToolResponse(result, err)
		},
	)
}

func newBoardUpsertMemberTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"board_upsert_member",
		"Add a collaborator or update their admin/member/viewer role. Call board_get_project first and only use when capabilities.canManageMembers is true. The project owner is not a membership and this tool cannot remove members.",
		func(ctx context.Context, input boardUpsertMemberInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := executeBatch(input.Items, func(_ int, item boardUpsertMemberItem) (any, error) {
				return board.UpsertMember(ctx, app, actorID, board.UpsertMemberCommand{ProjectID: input.ProjectID, UserID: item.UserID, Role: item.Role})
			})
			return batchToolResponse(result, err)
		},
	)
}

func newBoardCreateTaskTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"board_create_task",
		"Create a task. Call board_get_project first, require capabilities.canEditTasks, and use only returned state, label, and participant IDs. Server authorization permits owner, admin, and member roles but denies viewers.",
		func(ctx context.Context, input boardCreateTaskInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := executeBatch(input.Items, func(_ int, item boardCreateTaskItem) (any, error) {
				return board.CreateTask(ctx, app, actorID, board.CreateTaskCommand{ProjectID: input.ProjectID, StateID: item.StateID, Title: item.Title, Description: normalizeEscapedText(item.Description), Priority: item.Priority, DueDate: item.DueDate, LabelIDs: item.LabelIDs, AssigneeIDs: item.AssigneeIDs, DocIDs: item.DocumentIDs})
			})
			return batchToolResponse(result, err)
		},
	)
}

func newBoardUpdateTaskTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"board_update_task",
		"Patch an existing task without changing its project. Call board_get_project first, require capabilities.canEditTasks, and use only returned state, label, and participant IDs. Omitted fields stay unchanged; empty arrays clear relations; null dueDate clears it.",
		func(ctx context.Context, input boardUpdateTaskInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := executeBatch(input.Items, func(_ int, item boardUpdateTaskItem) (any, error) {
				return board.UpdateTask(ctx, app, actorID, board.UpdateTaskCommand{TaskID: item.TaskID, Title: item.Title, Description: normalizeEscapedTextPtr(item.Description), StateID: item.StateID, Priority: item.Priority, DueDate: item.DueDate, DueDateSet: item.dueDateSet, LabelIDs: item.LabelIDs, AssigneeIDs: item.AssigneeIDs, DocIDs: item.DocumentIDs})
			})
			return batchToolResponse(result, err)
		},
	)
}

func newBoardDeleteTaskTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"board_delete_task",
		"Permanently delete one Board task only when explicitly requested. Call board_search_tasks first and use an exact returned task ID. This action always pauses for user approval before deletion. If approval is denied, do not retry unless the user explicitly asks again.",
		func(ctx context.Context, input boardDeleteTaskInput, call fantasy.ToolCall) (fantasy.ToolResponse, error) {
			target, err := board.GetDeletableTask(ctx, app, actorID, input.TaskID)
			if err != nil {
				return boardToolResult(app, actorID, "prepare delete task", nil, err)
			}
			approved, err := workagent.RequireApproval(ctx, workagent.ApprovalRequest{
				ToolCallID: call.ID,
				ToolName:   call.Name,
				Title:      "Delete task?",
				Summary:    "Permanently delete “" + target.Title + "” from “" + target.ProjectName + "”.",
				Target: map[string]any{
					"type": "board_task",
					"id":   target.ID,
					"name": target.Title,
				},
				Details: []workagent.ApprovalDetail{
					{Label: "Project", Value: target.ProjectName},
				},
				Presentation: workagent.ApprovalPresentation{
					ConfirmLabel:   "Delete",
					ConfirmVariant: "destructive",
					PendingMessage: "Deleting task…",
					SuccessMessage: "Task deleted.",
					DeniedMessage:  "Task deletion cancelled.",
					FailureMessage: "The task could not be deleted.",
				},
			})
			if err != nil {
				return fantasy.ToolResponse{}, err
			}
			if !approved {
				return boardToolResult(app, actorID, "delete task", map[string]any{
					"ok": false, "action": "denied", "resourceType": "task", "id": target.ID,
					"name": target.Title, "projectId": target.ProjectID, "reason": "user_denied",
				}, nil)
			}
			result, err := board.DeleteTask(ctx, app, actorID, input.TaskID)
			return boardToolResult(app, actorID, "delete task", result, err)
		},
	)
}

func boardToolResult(app core.App, actorID, action string, value any, err error) (fantasy.ToolResponse, error) {
	if err != nil {
		app.Logger().Warn("assistant board mutation failed", "actorId", actorID, "action", action, "error", err)
		return fantasy.NewTextErrorResponse(err.Error()), nil
	}
	data, err := json.Marshal(value)
	if err != nil {
		return fantasy.NewTextErrorResponse("Failed to serialize Board result"), nil
	}
	return fantasy.NewTextResponse(string(data)), nil
}
