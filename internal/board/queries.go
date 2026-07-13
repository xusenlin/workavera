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

type ProjectCapabilities struct {
	CanEditProject    bool `json:"canEditProject"`
	CanManageWorkflow bool `json:"canManageWorkflow"`
	CanManageMembers  bool `json:"canManageMembers"`
	CanEditTasks      bool `json:"canEditTasks"`
	CanDeleteTasks    bool `json:"canDeleteTasks"`
	CanDeleteProject  bool `json:"canDeleteProject"`
}

type ProjectParticipantSummary struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Avatar       string `json:"avatar,omitempty"`
	CollectionID string `json:"collectionId,omitempty"`
	Role         string `json:"role"`
	MembershipID string `json:"membershipId,omitempty"`
}

type ProjectLabelSummary struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

type ProjectSummary struct {
	ID               string                      `json:"id"`
	Name             string                      `json:"name"`
	Description      string                      `json:"description,omitempty"`
	Archived         bool                        `json:"archived"`
	Owner            ProjectParticipantSummary   `json:"owner"`
	States           []ProjectStateSummary       `json:"states"`
	Labels           []ProjectLabelSummary       `json:"labels,omitempty"`
	Members          []ProjectParticipantSummary `json:"members,omitempty"`
	Participants     []ProjectParticipantSummary `json:"participants,omitempty"`
	CurrentActorRole string                      `json:"currentActorRole"`
	Capabilities     ProjectCapabilities         `json:"capabilities"`
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
	finalFilter := strings.Join(clauses, " && ")
	recordLimit := limit
	if len(options.UserIDs) > 0 {
		recordLimit = 0
	}
	records, err := app.FindRecordsByFilter(boardProjectsCollection, finalFilter, "-updated", recordLimit, 0, params)
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	if len(options.UserIDs) > 0 {
		records, err = filterProjectsByAssignees(ctx, app, records, options.UserIDs, limit)
		if err != nil {
			return nil, err
		}
	}
	if len(records) == 0 {
		return []ProjectSummary{}, nil
	}

	statesByProject, err := loadProjectStatesWithCountsBulk(ctx, app, records)
	if err != nil {
		return nil, err
	}
	ownersByID, err := loadProjectOwners(app, records)
	if err != nil {
		return nil, err
	}
	rolesByProject, err := loadProjectRoles(app, records, actorID)
	if err != nil {
		return nil, err
	}

	result := make([]ProjectSummary, 0, len(records))
	for _, record := range records {
		role := rolesByProject[record.Id]
		result = append(result, ProjectSummary{
			ID:               record.Id,
			Name:             record.GetString("name"),
			Description:      record.GetString("description"),
			Archived:         record.GetBool("archived"),
			Owner:            projectParticipantFromRecord(ownersByID[record.GetString("owner")], record.GetString("owner"), "owner", ""),
			States:           statesByProject[record.Id],
			CurrentActorRole: role,
			Capabilities:     projectCapabilities(role),
		})
	}
	return result, nil
}

func filterProjectsByAssignees(ctx context.Context, app core.App, projects []*core.Record, userIDs []string, limit int) ([]*core.Record, error) {
	if len(projects) == 0 {
		return nil, nil
	}
	projectIDs := make([]string, 0, len(projects))
	for _, project := range projects {
		projectIDs = append(projectIDs, project.Id)
	}
	filter, params := fieldMatchesAny("project", "project", projectIDs)
	tasks, err := app.FindRecordsByFilter(boardTasksCollection, filter, "", 0, 0, params)
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	wantedUsers := make(map[string]bool, len(userIDs))
	for _, userID := range userIDs {
		wantedUsers[userID] = true
	}
	assignedProjects := make(map[string]bool)
	for _, task := range tasks {
		for _, assigneeID := range task.GetStringSlice("assignees") {
			if wantedUsers[assigneeID] {
				assignedProjects[task.GetString("project")] = true
				break
			}
		}
	}
	filtered := make([]*core.Record, 0, min(limit, len(projects)))
	for _, project := range projects {
		if assignedProjects[project.Id] {
			filtered = append(filtered, project)
			if len(filtered) == limit {
				break
			}
		}
	}
	return filtered, nil
}

func fieldMatchesAny(field, keyPrefix string, values []string) (string, dbx.Params) {
	clauses := make([]string, 0, len(values))
	params := make(dbx.Params, len(values))
	for index, value := range values {
		key := fmt.Sprintf("%s%d", keyPrefix, index)
		clauses = append(clauses, field+" = {:"+key+"}")
		params[key] = value
	}
	return "(" + strings.Join(clauses, " || ") + ")", params
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
	role := projectActorRole(app, record, actorID)
	owner := projectParticipantFromUser(app, record.GetString("owner"), "owner", "")
	members, err := loadProjectMembers(app, record.Id)
	if err != nil {
		return ProjectSummary{}, err
	}
	labels, err := loadProjectLabels(app, record.Id)
	if err != nil {
		return ProjectSummary{}, err
	}
	participants := make([]ProjectParticipantSummary, 0, len(members)+1)
	participants = append(participants, owner)
	participants = append(participants, members...)
	return ProjectSummary{
		ID:               record.Id,
		Name:             record.GetString("name"),
		Description:      record.GetString("description"),
		Archived:         record.GetBool("archived"),
		Owner:            owner,
		States:           states,
		Labels:           labels,
		Members:          members,
		Participants:     participants,
		CurrentActorRole: role,
		Capabilities:     projectCapabilities(role),
	}, nil
}

func projectActorRole(app core.App, project *core.Record, actorID string) string {
	if project.GetString("owner") == actorID {
		return "owner"
	}
	membership, err := app.FindFirstRecordByFilter(
		boardProjectMembersCollection,
		"project = {:project} && user = {:user}",
		dbx.Params{"project": project.Id, "user": actorID},
	)
	if err != nil {
		return ""
	}
	return membership.GetString("role")
}

func projectCapabilities(role string) ProjectCapabilities {
	owner := role == "owner"
	taskWriter := owner || role == "admin" || role == "member"
	return ProjectCapabilities{
		CanEditProject:    owner,
		CanManageWorkflow: owner,
		CanManageMembers:  owner,
		CanEditTasks:      taskWriter,
		// Destructive assistant tools are intentionally not available.
		CanDeleteTasks:   false,
		CanDeleteProject: false,
	}
}

func projectParticipantFromUser(app core.App, userID, role, membershipID string) ProjectParticipantSummary {
	record, _ := app.FindRecordById("users", userID)
	return projectParticipantFromRecord(record, userID, role, membershipID)
}

func projectParticipantFromRecord(record *core.Record, userID, role, membershipID string) ProjectParticipantSummary {
	user := TaskAssigneeSummary{ID: userID, Name: userID}
	if record != nil {
		user = taskAssigneeFromRecord(record)
	}
	return ProjectParticipantSummary{
		ID: user.ID, Name: user.Name, Avatar: user.Avatar,
		CollectionID: user.CollectionID, Role: role, MembershipID: membershipID,
	}
}

func loadProjectOwners(app core.App, projects []*core.Record) (map[string]*core.Record, error) {
	ownerIDs := make([]string, 0, len(projects))
	seen := make(map[string]bool, len(projects))
	for _, project := range projects {
		ownerID := project.GetString("owner")
		if ownerID != "" && !seen[ownerID] {
			seen[ownerID] = true
			ownerIDs = append(ownerIDs, ownerID)
		}
	}
	if len(ownerIDs) == 0 {
		return map[string]*core.Record{}, nil
	}
	filter, params := fieldMatchesAny("id", "owner", ownerIDs)
	records, err := app.FindRecordsByFilter("users", filter, "", 0, 0, params)
	if err != nil {
		return nil, err
	}
	result := make(map[string]*core.Record, len(records))
	for _, record := range records {
		result[record.Id] = record
	}
	return result, nil
}

func loadProjectRoles(app core.App, projects []*core.Record, actorID string) (map[string]string, error) {
	roles := make(map[string]string, len(projects))
	memberProjectIDs := make([]string, 0, len(projects))
	for _, project := range projects {
		if project.GetString("owner") == actorID {
			roles[project.Id] = "owner"
		} else {
			memberProjectIDs = append(memberProjectIDs, project.Id)
		}
	}
	if len(memberProjectIDs) == 0 {
		return roles, nil
	}
	filter, params := fieldMatchesAny("project", "roleProject", memberProjectIDs)
	filter += " && user = {:actor}"
	params["actor"] = actorID
	memberships, err := app.FindRecordsByFilter(boardProjectMembersCollection, filter, "", 0, 0, params)
	if err != nil {
		return nil, err
	}
	for _, membership := range memberships {
		roles[membership.GetString("project")] = membership.GetString("role")
	}
	return roles, nil
}

func loadProjectMembers(app core.App, projectID string) ([]ProjectParticipantSummary, error) {
	records, err := app.FindRecordsByFilter(
		boardProjectMembersCollection,
		"project = {:project}",
		"created",
		0,
		0,
		dbx.Params{"project": projectID},
	)
	if err != nil {
		return nil, err
	}
	result := make([]ProjectParticipantSummary, 0, len(records))
	for _, record := range records {
		result = append(result, projectParticipantFromUser(
			app, record.GetString("user"), record.GetString("role"), record.Id,
		))
	}
	return result, nil
}

func loadProjectLabels(app core.App, projectID string) ([]ProjectLabelSummary, error) {
	records, err := app.FindRecordsByFilter(
		boardProjectLabelsCollection,
		"project = {:project}",
		"name",
		0,
		0,
		dbx.Params{"project": projectID},
	)
	if err != nil {
		return nil, err
	}
	result := make([]ProjectLabelSummary, 0, len(records))
	for _, record := range records {
		result = append(result, ProjectLabelSummary{
			ID: record.Id, Name: record.GetString("name"), Color: record.GetString("color"),
		})
	}
	return result, nil
}

func loadProjectStatesWithCountsBulk(ctx context.Context, app core.App, projects []*core.Record) (map[string][]ProjectStateSummary, error) {
	projectIDs := make([]string, 0, len(projects))
	result := make(map[string][]ProjectStateSummary, len(projects))
	for _, project := range projects {
		projectIDs = append(projectIDs, project.Id)
		result[project.Id] = []ProjectStateSummary{}
	}
	filter, params := fieldMatchesAny("project", "stateProject", projectIDs)
	stateRecords, err := app.FindRecordsByFilter(boardProjectStatesCollection, filter, "project,sort_order", 0, 0, params)
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	taskFilter, taskParams := fieldMatchesAny("project", "taskProject", projectIDs)
	taskRecords, err := app.FindRecordsByFilter(boardTasksCollection, taskFilter, "", 0, 0, taskParams)
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	taskCounts := make(map[string]int)
	for _, task := range taskRecords {
		taskCounts[task.GetString("state")]++
	}
	for _, state := range stateRecords {
		projectID := state.GetString("project")
		result[projectID] = append(result[projectID], ProjectStateSummary{
			ID:        state.Id,
			Name:      state.GetString("name"),
			Color:     state.GetString("color"),
			Category:  state.GetString("category"),
			TaskCount: taskCounts[state.Id],
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

// TaskDocSummary is a linked document resolved to its id and title so a tool
// consumer can decide whether to open it (e.g. via docs_get).
type TaskDocSummary struct {
	ID    string `json:"id"`
	Title string `json:"title"`
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
	Documents   []TaskDocSummary      `json:"documents"`
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

	// Preload the project's documents so each task's linked doc ids resolve to
	// titles in one pass.
	docRecords, err := app.FindRecordsByFilter(docsCollection, "project = {:project}", "", 0, 0, dbx.Params{"project": projectID})
	if err != nil {
		return TaskSearchResult{}, err
	}
	docsByID := make(map[string]TaskDocSummary, len(docRecords))
	for _, dr := range docRecords {
		docsByID[dr.Id] = TaskDocSummary{ID: dr.Id, Title: dr.GetString("title")}
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

		taskDocs := make([]TaskDocSummary, 0)
		for _, did := range tr.GetStringSlice("documents") {
			if doc, ok := docsByID[did]; ok {
				taskDocs = append(taskDocs, doc)
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
			Documents:   taskDocs,
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
