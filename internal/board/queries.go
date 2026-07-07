package board

import (
	"context"
	"errors"
	"fmt"
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

type ProjectStateSummary struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Color     string `json:"color"`
	Category  string `json:"category"`
	TaskCount int    `json:"taskCount"`
}

type ProjectSummary struct {
	ID          string                `json:"id"`
	Name        string                `json:"name"`
	Description string                `json:"description,omitempty"`
	Archived    bool                  `json:"archived"`
	States      []ProjectStateSummary `json:"states"`
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
		states, err := loadProjectStatesWithCounts(ctx, app, record.Id)
		if err != nil {
			return nil, err
		}
		result = append(result, ProjectSummary{
			ID:          record.Id,
			Name:        record.GetString("name"),
			Description: record.GetString("description"),
			Archived:    record.GetBool("archived"),
			States:      states,
		})
	}
	return result, nil
}

// loadProjectStatesWithCounts returns the states of a project sorted by
// sort_order, each annotated with the number of tasks currently in that state.
func loadProjectStatesWithCounts(ctx context.Context, app core.App, projectID string) ([]ProjectStateSummary, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	stateRecords, err := app.FindRecordsByFilter(boardProjectStatesCollection, "project = {:project}", "sort_order", 0, 0, dbx.Params{"project": projectID})
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	// Query all tasks for this project and count by state in Go. This avoids
	// per-state queries and avoids PocketBase array-operator pitfalls.
	taskCounts := make(map[string]int)
	if len(stateRecords) > 0 {
		taskRecords, err := app.FindRecordsByFilter(boardTasksCollection, "project = {:project}", "", 0, 0, dbx.Params{"project": projectID})
		if err != nil {
			return nil, err
		}
		for _, tr := range taskRecords {
			taskCounts[tr.GetString("state")]++
		}
	}

	states := make([]ProjectStateSummary, 0, len(stateRecords))
	for _, sr := range stateRecords {
		states = append(states, ProjectStateSummary{
			ID:        sr.Id,
			Name:      sr.GetString("name"),
			Color:     sr.GetString("color"),
			Category:  sr.GetString("category"),
			TaskCount: taskCounts[sr.Id],
		})
	}
	return states, nil
}

type TaskSearchOptions struct {
	ProjectID string
	StateIDs  []string
}

type TaskAssigneeSummary struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type TaskSummary struct {
	ID        string                `json:"id"`
	Title     string                `json:"title"`
	Priority  string                `json:"priority,omitempty"`
	DueDate   string                `json:"dueDate,omitempty"`
	Assignees []TaskAssigneeSummary `json:"assignees"`
}

// SearchVisibleTasks returns the tasks of a project visible to the actor,
// optionally filtered by one or more states. Labels and assignee names are
// resolved server-side so the tool result is self-contained.
func SearchVisibleTasks(ctx context.Context, app core.App, actorID string, options TaskSearchOptions) ([]TaskSummary, error) {
	if actorID == "" {
		return nil, errors.New("missing actor")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if _, err := app.FindRecordById("users", actorID); err != nil {
		return nil, errors.New("actor is not an active user")
	}
	projectID := strings.TrimSpace(options.ProjectID)
	if projectID == "" {
		return nil, errors.New("project ID is required")
	}

	// Verify the actor can access the project.
	project, err := app.FindRecordById(boardProjectsCollection, projectID)
	if err != nil {
		return nil, errors.New("project not found")
	}
	visible, err := projectVisibleTo(app, project, actorID)
	if err != nil {
		return nil, err
	}
	if !visible {
		return nil, errors.New("project not found")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	// Build filter: project = {:project} && optionally state filter.
	filter := "project = {:project}"
	params := dbx.Params{"project": projectID}
	if len(options.StateIDs) > 0 {
		stateClauses := make([]string, 0, len(options.StateIDs))
		for i, sid := range options.StateIDs {
			key := fmt.Sprintf("state%d", i)
			stateClauses = append(stateClauses, "state = {:"+key+"}")
			params[key] = sid
		}
		filter += " && (" + strings.Join(stateClauses, " || ") + ")"
	}

	taskRecords, err := app.FindRecordsByFilter(boardTasksCollection, filter, "rank", 0, 0, params)
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	result := make([]TaskSummary, 0, len(taskRecords))
	for _, tr := range taskRecords {
		assignees := make([]TaskAssigneeSummary, 0)
		for _, uid := range tr.GetStringSlice("assignees") {
			assignees = append(assignees, TaskAssigneeSummary{
				ID:   uid,
				Name: boardRecordName(app, "users", uid),
			})
		}

		result = append(result, TaskSummary{
			ID:        tr.Id,
			Title:     tr.GetString("title"),
			Priority:  tr.GetString("priority"),
			DueDate:   tr.GetString("due_date"),
			Assignees: assignees,
		})
	}
	return result, nil
}

// projectVisibleTo checks whether the actor is the owner or a member of the
// project. This mirrors the board_projects listRule visibility clause.
func projectVisibleTo(app core.App, project *core.Record, actorID string) (bool, error) {
	if project.GetString("owner") == actorID {
		return true, nil
	}
	members, err := app.FindRecordsByFilter(boardProjectMembersCollection, "project = {:project} && user = {:user}", "", 0, 0, dbx.Params{"project": project.Id, "user": actorID})
	if err != nil {
		return false, err
	}
	return len(members) > 0, nil
}
