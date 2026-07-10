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
	UserIDs         []string
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
	if len(options.UserIDs) > 0 {
		userClauses := make([]string, 0, len(options.UserIDs))
		for i, uid := range options.UserIDs {
			key := fmt.Sprintf("user%d", i)
			userClauses = append(userClauses, "user = {:"+key+"}")
			params[key] = uid
		}
		memberFilter := strings.Join(userClauses, " || ")
		memberRecords, err := app.FindRecordsByFilter(boardProjectMembersCollection, memberFilter, "", 0, 0, params)
		if err != nil {
			return nil, err
		}
		projectIDSet := make(map[string]bool)
		for _, mr := range memberRecords {
			projectIDSet[mr.GetString("project")] = true
		}
		if len(projectIDSet) == 0 {
			return []ProjectSummary{}, nil
		}
		projectIDClauses := make([]string, 0, len(projectIDSet))
		for id := range projectIDSet {
			key := fmt.Sprintf("pid_%s", id)
			projectIDClauses = append(projectIDClauses, "id = {:"+key+"}")
			params[key] = id
		}
		clauses = append(clauses, "("+strings.Join(projectIDClauses, " || ")+")")
	}

	finalFilter := strings.Join(clauses, " && ")
	records, err := app.FindRecordsByFilter(boardProjectsCollection, finalFilter, "-updated", limit, 0, params)
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

// GetVisibleProject returns a single project by ID if it is visible to the
// actor (owner or member). The result includes states with task counts.
func GetVisibleProject(ctx context.Context, app core.App, actorID, projectID string) (ProjectSummary, error) {
	if actorID == "" {
		return ProjectSummary{}, errors.New("missing actor")
	}
	if err := ctx.Err(); err != nil {
		return ProjectSummary{}, err
	}
	if _, err := app.FindRecordById("users", actorID); err != nil {
		return ProjectSummary{}, errors.New("actor is not an active user")
	}

	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		return ProjectSummary{}, errors.New("project ID is required")
	}

	record, err := app.FindRecordById(boardProjectsCollection, projectID)
	if err != nil {
		return ProjectSummary{}, errors.New("project not found")
	}
	visible, err := projectVisibleTo(app, record, actorID)
	if err != nil {
		return ProjectSummary{}, err
	}
	if !visible {
		return ProjectSummary{}, errors.New("project not found")
	}

	states, err := loadProjectStatesWithCounts(ctx, app, record.Id)
	if err != nil {
		return ProjectSummary{}, err
	}
	return ProjectSummary{
		ID:          record.Id,
		Name:        record.GetString("name"),
		Description: record.GetString("description"),
		Archived:    record.GetBool("archived"),
		States:      states,
	}, nil
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
	UserIDs   []string
}

// TaskStateSummary carries the state a task belongs to so tool consumers can
// group tasks by state without an extra fetch.
type TaskStateSummary struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Color     string `json:"color"`
	Category  string `json:"category"`
	SortOrder int    `json:"sortOrder"`
}

// TaskLabelSummary is a label resolved to its display name and color.
type TaskLabelSummary struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

// TaskAssigneeSummary is an assignee resolved to a display name and avatar.
type TaskAssigneeSummary struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Avatar       string `json:"avatar,omitempty"`
	CollectionID string `json:"collectionId,omitempty"`
}

// TaskSummary is a self-contained task representation for tool consumers. All
// related fields (state, labels, assignees) are resolved server-side so the
// frontend can render the result without additional requests.
type TaskSummary struct {
	ID          string                `json:"id"`
	Title       string                `json:"title"`
	Description string                `json:"description,omitempty"`
	Priority    string                `json:"priority,omitempty"`
	DueDate     string                `json:"dueDate,omitempty"`
	StateID     string                `json:"stateId"`
	Labels      []TaskLabelSummary    `json:"labels"`
	Assignees   []TaskAssigneeSummary `json:"assignees"`
	Rank        float64               `json:"rank"`
}

// TaskSearchResult bundles the matching states and tasks so a tool consumer
// can render them grouped by state.
type TaskSearchResult struct {
	States []TaskStateSummary `json:"states"`
	Tasks  []TaskSummary      `json:"tasks"`
}

// SearchVisibleTasks returns the tasks of a project visible to the actor,
// optionally filtered by one or more states. Labels and assignee names are
// resolved server-side so the tool result is self-contained.
func SearchVisibleTasks(ctx context.Context, app core.App, actorID string, options TaskSearchOptions) (TaskSearchResult, error) {
	if actorID == "" {
		return TaskSearchResult{}, errors.New("missing actor")
	}
	if err := ctx.Err(); err != nil {
		return TaskSearchResult{}, err
	}
	if _, err := app.FindRecordById("users", actorID); err != nil {
		return TaskSearchResult{}, errors.New("actor is not an active user")
	}
	projectID := strings.TrimSpace(options.ProjectID)
	if projectID == "" {
		return TaskSearchResult{}, errors.New("project ID is required")
	}

	// Verify the actor can access the project.
	project, err := app.FindRecordById(boardProjectsCollection, projectID)
	if err != nil {
		return TaskSearchResult{}, errors.New("project not found")
	}
	visible, err := projectVisibleTo(app, project, actorID)
	if err != nil {
		return TaskSearchResult{}, err
	}
	if !visible {
		return TaskSearchResult{}, errors.New("project not found")
	}
	if err := ctx.Err(); err != nil {
		return TaskSearchResult{}, err
	}

	// Build filter: project = {:project} && optionally state filter.
	// Assignee filtering is done in Go after the query because PocketBase's
	// ?= operator does not work reliably with parameterized placeholders.
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
		return TaskSearchResult{}, err
	}
	if err := ctx.Err(); err != nil {
		return TaskSearchResult{}, err
	}

	// Filter by assignees in Go (PocketBase ?= with params is unreliable).
	if len(options.UserIDs) > 0 {
		userSet := make(map[string]bool, len(options.UserIDs))
		for _, uid := range options.UserIDs {
			userSet[uid] = true
		}
		filtered := taskRecords[:0]
		for _, tr := range taskRecords {
			for _, uid := range tr.GetStringSlice("assignees") {
				if userSet[uid] {
					filtered = append(filtered, tr)
					break
				}
			}
		}
		taskRecords = filtered
	}

	// Load the project states (optionally filtered) once, sorted by sort_order.
	stateFilter := "project = {:project}"
	stateParams := dbx.Params{"project": projectID}
	if len(options.StateIDs) > 0 {
		stateClauses := make([]string, 0, len(options.StateIDs))
		for i, sid := range options.StateIDs {
			key := fmt.Sprintf("sid%d", i)
			stateClauses = append(stateClauses, "id = {:"+key+"}")
			stateParams[key] = sid
		}
		stateFilter += " && (" + strings.Join(stateClauses, " || ") + ")"
	}
	stateRecords, err := app.FindRecordsByFilter(boardProjectStatesCollection, stateFilter, "sort_order", 0, 0, stateParams)
	if err != nil {
		return TaskSearchResult{}, err
	}
	if err := ctx.Err(); err != nil {
		return TaskSearchResult{}, err
	}

	states := make([]TaskStateSummary, 0, len(stateRecords))
	for _, sr := range stateRecords {
		states = append(states, TaskStateSummary{
			ID:        sr.Id,
			Name:      sr.GetString("name"),
			Color:     sr.GetString("color"),
			Category:  sr.GetString("category"),
			SortOrder: sr.GetInt("sort_order"),
		})
	}

	// Preload all project labels so we can resolve each task's label ids in one
	// pass instead of querying per task.
	labelRecords, err := app.FindRecordsByFilter(boardProjectLabelsCollection, "project = {:project}", "", 0, 0, dbx.Params{"project": projectID})
	if err != nil {
		return TaskSearchResult{}, err
	}
	labelsByID := make(map[string]TaskLabelSummary, len(labelRecords))
	for _, lr := range labelRecords {
		labelsByID[lr.Id] = TaskLabelSummary{
			ID:    lr.Id,
			Name:  lr.GetString("name"),
			Color: lr.GetString("color"),
		}
	}

	result := make([]TaskSummary, 0, len(taskRecords))
	for _, tr := range taskRecords {
		assignees := make([]TaskAssigneeSummary, 0)
		for _, uid := range tr.GetStringSlice("assignees") {
			assignees = append(assignees, boardAssigneeSummary(app, uid))
		}

		taskLabels := make([]TaskLabelSummary, 0)
		for _, lid := range tr.GetStringSlice("labels") {
			if label, ok := labelsByID[lid]; ok {
				taskLabels = append(taskLabels, label)
			}
		}

		result = append(result, TaskSummary{
			ID:          tr.Id,
			Title:       tr.GetString("title"),
			Description: tr.GetString("description"),
			Priority:    tr.GetString("priority"),
			DueDate:     tr.GetString("due_date"),
			StateID:     tr.GetString("state"),
			Labels:      taskLabels,
			Assignees:   assignees,
			Rank:        tr.GetFloat("rank"),
		})
	}
	return TaskSearchResult{States: states, Tasks: result}, nil
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
