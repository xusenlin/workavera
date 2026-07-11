package board

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

var (
	ErrProjectNotFound = errors.New("project not found")
	ErrOwnerOnly       = errors.New("only the project owner can perform this action")
	ErrTaskWriteDenied = errors.New("you cannot edit tasks in this project")
)

type TemplateState struct {
	Name     string `json:"name"`
	Color    string `json:"color"`
	Category string `json:"category"`
}

type TemplateLabel struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

type TemplateSummary struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	States      []TemplateState `json:"states"`
	Labels      []TemplateLabel `json:"labels"`
}

type MutationResult struct {
	OK           bool   `json:"ok"`
	Action       string `json:"action"`
	ResourceType string `json:"resourceType"`
	ID           string `json:"id"`
	Name         string `json:"name"`
	ProjectID    string `json:"projectId"`
}

type CreateProjectCommand struct {
	Name        string
	Description string
	TemplateID  string
	States      []TemplateState
	Labels      []TemplateLabel
	Members     []UpsertMemberCommand
}

type UpdateProjectCommand struct {
	ProjectID   string
	Name        *string
	Description *string
}

type UpsertStateCommand struct {
	ProjectID string
	StateID   string
	Name      *string
	Color     *string
	Category  *string
	SortOrder *float64
}

type UpsertLabelCommand struct {
	ProjectID string
	LabelID   string
	Name      *string
	Color     *string
}

type UpsertMemberCommand struct {
	ProjectID string
	UserID    string
	Role      string
}

type CreateTaskCommand struct {
	ProjectID   string
	StateID     string
	Title       string
	Description string
	Priority    string
	DueDate     string
	LabelIDs    []string
	AssigneeIDs []string
}

type UpdateTaskCommand struct {
	TaskID      string
	Title       *string
	Description *string
	StateID     *string
	Priority    *string
	DueDate     *string
	DueDateSet  bool
	LabelIDs    *[]string
	AssigneeIDs *[]string
}

func ListVisibleTemplates(ctx context.Context, app core.App, actorID string) ([]TemplateSummary, error) {
	if err := requireActiveActor(ctx, app, actorID); err != nil {
		return nil, err
	}
	records, err := app.FindRecordsByFilter(
		boardTemplatesCollection,
		"owner = '' || owner = {:actor}",
		"name",
		0,
		0,
		dbx.Params{"actor": actorID},
	)
	if err != nil {
		return nil, err
	}
	result := make([]TemplateSummary, 0, len(records))
	for _, record := range records {
		var states []TemplateState
		var labels []TemplateLabel
		if err := decodeRecordJSON(record.Get("states"), &states); err != nil {
			return nil, fmt.Errorf("decode template states: %w", err)
		}
		if err := decodeRecordJSON(record.Get("labels"), &labels); err != nil {
			return nil, fmt.Errorf("decode template labels: %w", err)
		}
		result = append(result, TemplateSummary{
			ID: record.Id, Name: record.GetString("name"),
			Description: record.GetString("description"), States: states, Labels: labels,
		})
	}
	return result, nil
}

func CreateProject(ctx context.Context, app core.App, actorID string, command CreateProjectCommand) (MutationResult, error) {
	if err := requireActiveActor(ctx, app, actorID); err != nil {
		return MutationResult{}, err
	}
	command.Name = strings.TrimSpace(command.Name)
	command.Description = strings.TrimSpace(command.Description)
	if command.Name == "" {
		return MutationResult{}, errors.New("project name is required")
	}
	if command.TemplateID != "" {
		template, err := app.FindRecordById(boardTemplatesCollection, strings.TrimSpace(command.TemplateID))
		if err != nil || (template.GetString("owner") != "" && template.GetString("owner") != actorID) {
			return MutationResult{}, errors.New("template not found")
		}
		if err := decodeRecordJSON(template.Get("states"), &command.States); err != nil {
			return MutationResult{}, fmt.Errorf("decode template states: %w", err)
		}
		if err := decodeRecordJSON(template.Get("labels"), &command.Labels); err != nil {
			return MutationResult{}, fmt.Errorf("decode template labels: %w", err)
		}
	}

	var projectID string
	err := app.RunInTransaction(func(tx core.App) error {
		collection, err := tx.FindCollectionByNameOrId(boardProjectsCollection)
		if err != nil {
			return err
		}
		project := core.NewRecord(collection)
		project.Set("name", command.Name)
		project.Set("description", command.Description)
		project.Set("owner", actorID)
		project.Set("archived", false)
		if err := tx.Save(project); err != nil {
			return err
		}
		projectID = project.Id
		if err := createProjectStates(tx, projectID, command.States); err != nil {
			return err
		}
		if err := createProjectLabels(tx, projectID, command.Labels); err != nil {
			return err
		}
		for _, member := range command.Members {
			member.ProjectID = projectID
			if _, err := upsertMember(tx, actorID, member, false); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return MutationResult{}, err
	}
	return MutationResult{OK: true, Action: "created", ResourceType: "project", ID: projectID, Name: command.Name, ProjectID: projectID}, nil
}

func UpdateProject(ctx context.Context, app core.App, actorID string, command UpdateProjectCommand) (MutationResult, error) {
	if err := requireActiveActor(ctx, app, actorID); err != nil {
		return MutationResult{}, err
	}
	var result MutationResult
	err := app.RunInTransaction(func(tx core.App) error {
		project, err := requireProjectOwner(tx, actorID, command.ProjectID)
		if err != nil {
			return err
		}
		before := project.Fresh()
		if command.Name != nil {
			name := strings.TrimSpace(*command.Name)
			if name == "" {
				return errors.New("project name cannot be empty")
			}
			project.Set("name", name)
		}
		if command.Description != nil {
			project.Set("description", strings.TrimSpace(*command.Description))
		}
		changes := map[string]any{}
		addTextChange(changes, "name", before.GetString("name"), project.GetString("name"))
		if before.GetString("description") != project.GetString("description") {
			changes["description"] = map[string]any{"changed": true}
		}
		if len(changes) > 0 {
			if err := tx.Save(project); err != nil {
				return err
			}
			actor, _ := tx.FindRecordById("users", actorID)
			if err := saveBoardProjectOperationLog(tx, actor, project.Id, "update_project", changes); err != nil {
				return err
			}
		}
		result = MutationResult{OK: true, Action: "updated", ResourceType: "project", ID: project.Id, Name: project.GetString("name"), ProjectID: project.Id}
		return nil
	})
	return result, err
}

func UpsertState(ctx context.Context, app core.App, actorID string, command UpsertStateCommand) (MutationResult, error) {
	if err := requireActiveActor(ctx, app, actorID); err != nil {
		return MutationResult{}, err
	}
	var result MutationResult
	err := app.RunInTransaction(func(tx core.App) error {
		project, err := requireProjectOwner(tx, actorID, command.ProjectID)
		if err != nil {
			return err
		}
		var record *core.Record
		var before *core.Record
		action := "create_state"
		if strings.TrimSpace(command.StateID) == "" {
			collection, err := tx.FindCollectionByNameOrId(boardProjectStatesCollection)
			if err != nil {
				return err
			}
			record = core.NewRecord(collection)
			record.Set("project", project.Id)
			if command.Name == nil || command.Color == nil || command.Category == nil {
				return errors.New("name, color, and category are required when creating a state")
			}
			record.Set("sort_order", nextStateSortOrder(tx, project.Id))
		} else {
			record, err = tx.FindRecordById(boardProjectStatesCollection, command.StateID)
			if err != nil || record.GetString("project") != project.Id {
				return errors.New("state not found in this project")
			}
			before = record.Fresh()
			action = "update_state"
		}
		if command.Name != nil {
			name := strings.TrimSpace(*command.Name)
			if name == "" {
				return errors.New("state name cannot be empty")
			}
			record.Set("name", name)
		}
		if command.Color != nil {
			record.Set("color", strings.TrimSpace(*command.Color))
		}
		if command.Category != nil {
			category := strings.TrimSpace(*command.Category)
			if category != "pending" && category != "active" && category != "completed" {
				return errors.New("state category must be pending, active, or completed")
			}
			record.Set("category", category)
		}
		if command.SortOrder != nil {
			record.Set("sort_order", *command.SortOrder)
		}
		if before != nil && before.GetString("name") == record.GetString("name") &&
			before.GetString("color") == record.GetString("color") &&
			before.GetString("category") == record.GetString("category") &&
			before.GetFloat("sort_order") == record.GetFloat("sort_order") {
			result = MutationResult{OK: true, Action: "updated", ResourceType: "state", ID: record.Id, Name: record.GetString("name"), ProjectID: project.Id}
			return nil
		}
		if err := tx.Save(record); err != nil {
			return err
		}
		changes := map[string]any{"state": boardProjectStateSnapshot(record)}
		if before != nil {
			addTextChange(changes, "name", before.GetString("name"), record.GetString("name"))
			addTextChange(changes, "color", before.GetString("color"), record.GetString("color"))
			addTextChange(changes, "category", before.GetString("category"), record.GetString("category"))
			if before.GetFloat("sort_order") != record.GetFloat("sort_order") {
				changes["sort_order"] = map[string]any{"from": before.GetFloat("sort_order"), "to": record.GetFloat("sort_order")}
			}
		}
		actor, _ := tx.FindRecordById("users", actorID)
		if before == nil || len(changes) > 1 {
			if err := saveBoardProjectOperationLog(tx, actor, project.Id, action, changes); err != nil {
				return err
			}
		}
		result = MutationResult{OK: true, Action: strings.TrimPrefix(action, "create_"), ResourceType: "state", ID: record.Id, Name: record.GetString("name"), ProjectID: project.Id}
		if action == "update_state" {
			result.Action = "updated"
		} else {
			result.Action = "created"
		}
		return nil
	})
	return result, err
}

func UpsertLabel(ctx context.Context, app core.App, actorID string, command UpsertLabelCommand) (MutationResult, error) {
	if err := requireActiveActor(ctx, app, actorID); err != nil {
		return MutationResult{}, err
	}
	var result MutationResult
	err := app.RunInTransaction(func(tx core.App) error {
		project, err := requireProjectOwner(tx, actorID, command.ProjectID)
		if err != nil {
			return err
		}
		var record, before *core.Record
		action := "create_label"
		if strings.TrimSpace(command.LabelID) == "" {
			collection, err := tx.FindCollectionByNameOrId(boardProjectLabelsCollection)
			if err != nil {
				return err
			}
			record = core.NewRecord(collection)
			record.Set("project", project.Id)
			if command.Name == nil || command.Color == nil {
				return errors.New("name and color are required when creating a label")
			}
		} else {
			record, err = tx.FindRecordById(boardProjectLabelsCollection, command.LabelID)
			if err != nil || record.GetString("project") != project.Id {
				return errors.New("label not found in this project")
			}
			before = record.Fresh()
			action = "update_label"
		}
		if command.Name != nil {
			name := strings.TrimSpace(*command.Name)
			if name == "" {
				return errors.New("label name cannot be empty")
			}
			record.Set("name", name)
		}
		if command.Color != nil {
			record.Set("color", strings.TrimSpace(*command.Color))
		}
		if before != nil && before.GetString("name") == record.GetString("name") && before.GetString("color") == record.GetString("color") {
			result = MutationResult{OK: true, Action: "updated", ResourceType: "label", ID: record.Id, Name: record.GetString("name"), ProjectID: project.Id}
			return nil
		}
		if err := tx.Save(record); err != nil {
			return err
		}
		changes := map[string]any{"label": boardProjectLabelSnapshot(record)}
		if before != nil {
			addTextChange(changes, "name", before.GetString("name"), record.GetString("name"))
			addTextChange(changes, "color", before.GetString("color"), record.GetString("color"))
		}
		actor, _ := tx.FindRecordById("users", actorID)
		if before == nil || len(changes) > 1 {
			if err := saveBoardProjectOperationLog(tx, actor, project.Id, action, changes); err != nil {
				return err
			}
		}
		result = MutationResult{OK: true, Action: "created", ResourceType: "label", ID: record.Id, Name: record.GetString("name"), ProjectID: project.Id}
		if before != nil {
			result.Action = "updated"
		}
		return nil
	})
	return result, err
}

func UpsertMember(ctx context.Context, app core.App, actorID string, command UpsertMemberCommand) (MutationResult, error) {
	if err := requireActiveActor(ctx, app, actorID); err != nil {
		return MutationResult{}, err
	}
	var result MutationResult
	err := app.RunInTransaction(func(tx core.App) error {
		var err error
		result, err = upsertMember(tx, actorID, command, true)
		return err
	})
	return result, err
}

func upsertMember(app core.App, actorID string, command UpsertMemberCommand, log bool) (MutationResult, error) {
	project, err := requireProjectOwner(app, actorID, command.ProjectID)
	if err != nil {
		return MutationResult{}, err
	}
	command.UserID = strings.TrimSpace(command.UserID)
	if command.UserID == "" {
		return MutationResult{}, errors.New("user ID is required")
	}
	if command.UserID == project.GetString("owner") {
		return MutationResult{}, errors.New("the project owner cannot also be a project member")
	}
	if command.Role != "admin" && command.Role != "member" && command.Role != "viewer" {
		return MutationResult{}, errors.New("member role must be admin, member, or viewer")
	}
	if _, err := app.FindRecordById("users", command.UserID); err != nil {
		return MutationResult{}, errors.New("user is not active")
	}
	records, err := app.FindRecordsByFilter(boardProjectMembersCollection, "project = {:project} && user = {:user}", "", 1, 0, dbx.Params{"project": project.Id, "user": command.UserID})
	if err != nil {
		return MutationResult{}, err
	}
	var record, before *core.Record
	action := "add_member"
	if len(records) > 0 {
		record = records[0]
		before = record.Fresh()
		action = "update_member"
	} else {
		collection, err := app.FindCollectionByNameOrId(boardProjectMembersCollection)
		if err != nil {
			return MutationResult{}, err
		}
		record = core.NewRecord(collection)
		record.Set("project", project.Id)
		record.Set("user", command.UserID)
	}
	record.Set("role", command.Role)
	if before != nil && before.GetString("role") == record.GetString("role") {
		return MutationResult{OK: true, Action: "updated", ResourceType: "member", ID: record.Id, Name: boardRecordName(app, "users", command.UserID), ProjectID: project.Id}, nil
	}
	if err := app.Save(record); err != nil {
		return MutationResult{}, err
	}
	if log && (before == nil || before.GetString("role") != record.GetString("role")) {
		actor, _ := app.FindRecordById("users", actorID)
		changes := map[string]any{"member": boardProjectMemberSnapshot(app, record)}
		if before != nil {
			changes["role"] = map[string]any{"from": before.GetString("role"), "to": record.GetString("role")}
		}
		if err := saveBoardProjectOperationLog(app, actor, project.Id, action, changes); err != nil {
			return MutationResult{}, err
		}
	}
	return MutationResult{OK: true, Action: map[bool]string{true: "updated", false: "created"}[before != nil], ResourceType: "member", ID: record.Id, Name: boardRecordName(app, "users", command.UserID), ProjectID: project.Id}, nil
}

func CreateTask(ctx context.Context, app core.App, actorID string, command CreateTaskCommand) (MutationResult, error) {
	if err := requireActiveActor(ctx, app, actorID); err != nil {
		return MutationResult{}, err
	}
	var result MutationResult
	err := app.RunInTransaction(func(tx core.App) error {
		project, err := requireTaskWriter(tx, actorID, command.ProjectID)
		if err != nil {
			return err
		}
		command.Title = strings.TrimSpace(command.Title)
		if command.Title == "" {
			return errors.New("task title is required")
		}
		if command.Priority == "" {
			command.Priority = "medium"
		}
		if err := validateTaskRelations(tx, project, command.StateID, command.LabelIDs, command.AssigneeIDs); err != nil {
			return err
		}
		if err := validatePriority(command.Priority); err != nil {
			return err
		}
		collection, err := tx.FindCollectionByNameOrId(boardTasksCollection)
		if err != nil {
			return err
		}
		record := core.NewRecord(collection)
		record.Set("project", project.Id)
		record.Set("state", command.StateID)
		record.Set("title", command.Title)
		record.Set("description", strings.TrimSpace(command.Description))
		record.Set("priority", command.Priority)
		record.Set("due_date", command.DueDate)
		record.Set("labels", command.LabelIDs)
		record.Set("assignees", command.AssigneeIDs)
		record.Set("created_by", actorID)
		record.Set("rank", nextTaskRank(tx, project.Id, command.StateID))
		if err := tx.Save(record); err != nil {
			return err
		}
		actor, _ := tx.FindRecordById("users", actorID)
		if err := saveBoardTaskOperationLog(tx, actor, record, "create", map[string]any{}); err != nil {
			return err
		}
		result = MutationResult{OK: true, Action: "created", ResourceType: "task", ID: record.Id, Name: record.GetString("title"), ProjectID: project.Id}
		return nil
	})
	return result, err
}

func UpdateTask(ctx context.Context, app core.App, actorID string, command UpdateTaskCommand) (MutationResult, error) {
	if err := requireActiveActor(ctx, app, actorID); err != nil {
		return MutationResult{}, err
	}
	var result MutationResult
	err := app.RunInTransaction(func(tx core.App) error {
		record, err := tx.FindRecordById(boardTasksCollection, strings.TrimSpace(command.TaskID))
		if err != nil {
			return errors.New("task not found")
		}
		project, err := requireTaskWriter(tx, actorID, record.GetString("project"))
		if err != nil {
			return err
		}
		before := record.Fresh()
		if command.Title != nil {
			title := strings.TrimSpace(*command.Title)
			if title == "" {
				return errors.New("task title cannot be empty")
			}
			record.Set("title", title)
		}
		if command.Description != nil {
			record.Set("description", strings.TrimSpace(*command.Description))
		}
		if command.StateID != nil {
			record.Set("state", strings.TrimSpace(*command.StateID))
		}
		if command.Priority != nil {
			if err := validatePriority(*command.Priority); err != nil {
				return err
			}
			record.Set("priority", *command.Priority)
		}
		if command.DueDateSet {
			if command.DueDate == nil {
				record.Set("due_date", "")
			} else {
				record.Set("due_date", strings.TrimSpace(*command.DueDate))
			}
		}
		if command.LabelIDs != nil {
			record.Set("labels", *command.LabelIDs)
		}
		if command.AssigneeIDs != nil {
			record.Set("assignees", *command.AssigneeIDs)
		}
		if err := validateTaskRelations(tx, project, record.GetString("state"), record.GetStringSlice("labels"), record.GetStringSlice("assignees")); err != nil {
			return err
		}
		changes := buildBoardTaskChanges(tx, before, record)
		if len(changes) > 0 {
			if err := tx.Save(record); err != nil {
				return err
			}
			action := "update"
			if _, moved := changes["state"]; moved {
				action = "move"
			}
			actor, _ := tx.FindRecordById("users", actorID)
			if err := saveBoardTaskOperationLog(tx, actor, record, action, changes); err != nil {
				return err
			}
		}
		result = MutationResult{OK: true, Action: "updated", ResourceType: "task", ID: record.Id, Name: record.GetString("title"), ProjectID: project.Id}
		return nil
	})
	return result, err
}

func requireActiveActor(ctx context.Context, app core.App, actorID string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if strings.TrimSpace(actorID) == "" {
		return errors.New("missing actor")
	}
	if _, err := app.FindRecordById("users", actorID); err != nil {
		return errors.New("actor is not an active user")
	}
	return nil
}

func requireProjectOwner(app core.App, actorID, projectID string) (*core.Record, error) {
	project, err := app.FindRecordById(boardProjectsCollection, strings.TrimSpace(projectID))
	if err != nil {
		return nil, ErrProjectNotFound
	}
	if project.GetString("owner") != actorID {
		return nil, ErrOwnerOnly
	}
	return project, nil
}

func requireTaskWriter(app core.App, actorID, projectID string) (*core.Record, error) {
	project, err := app.FindRecordById(boardProjectsCollection, strings.TrimSpace(projectID))
	if err != nil {
		return nil, ErrProjectNotFound
	}
	role := projectActorRole(app, project, actorID)
	if role != "owner" && role != "admin" && role != "member" {
		return nil, ErrTaskWriteDenied
	}
	return project, nil
}

func validateTaskRelations(app core.App, project *core.Record, stateID string, labelIDs, assigneeIDs []string) error {
	state, err := app.FindRecordById(boardProjectStatesCollection, strings.TrimSpace(stateID))
	if err != nil || state.GetString("project") != project.Id {
		return errors.New("selected state does not belong to this project")
	}
	for _, id := range labelIDs {
		label, err := app.FindRecordById(boardProjectLabelsCollection, id)
		if err != nil || label.GetString("project") != project.Id {
			return errors.New("a selected label does not belong to this project")
		}
	}
	for _, id := range assigneeIDs {
		visible, err := projectVisibleTo(app, project, id)
		if err != nil || !visible {
			return errors.New("every assignee must be the project owner or a project member")
		}
	}
	return nil
}

func validatePriority(priority string) error {
	if priority != "none" && priority != "low" && priority != "medium" && priority != "high" && priority != "urgent" {
		return errors.New("priority must be none, low, medium, high, or urgent")
	}
	return nil
}

func nextStateSortOrder(app core.App, projectID string) float64 {
	records, _ := app.FindRecordsByFilter(boardProjectStatesCollection, "project = {:project}", "-sort_order", 1, 0, dbx.Params{"project": projectID})
	if len(records) == 0 {
		return 1024
	}
	return records[0].GetFloat("sort_order") + 1024
}

func nextTaskRank(app core.App, projectID, stateID string) float64 {
	records, _ := app.FindRecordsByFilter(boardTasksCollection, "project = {:project} && state = {:state}", "-rank", 1, 0, dbx.Params{"project": projectID, "state": stateID})
	if len(records) == 0 {
		return 1024
	}
	return records[0].GetFloat("rank") + 1024
}

func createProjectStates(app core.App, projectID string, states []TemplateState) error {
	if len(states) == 0 {
		return nil
	}
	collection, err := app.FindCollectionByNameOrId(boardProjectStatesCollection)
	if err != nil {
		return err
	}
	for index, state := range states {
		state.Name = strings.TrimSpace(state.Name)
		if state.Name == "" {
			continue
		}
		if state.Category != "pending" && state.Category != "active" && state.Category != "completed" {
			return errors.New("state category must be pending, active, or completed")
		}
		record := core.NewRecord(collection)
		record.Set("project", projectID)
		record.Set("name", state.Name)
		record.Set("color", state.Color)
		record.Set("category", state.Category)
		record.Set("sort_order", (index+1)*1024)
		if err := app.Save(record); err != nil {
			return err
		}
	}
	return nil
}

func createProjectLabels(app core.App, projectID string, labels []TemplateLabel) error {
	if len(labels) == 0 {
		return nil
	}
	collection, err := app.FindCollectionByNameOrId(boardProjectLabelsCollection)
	if err != nil {
		return err
	}
	for _, label := range labels {
		label.Name = strings.TrimSpace(label.Name)
		if label.Name == "" {
			continue
		}
		record := core.NewRecord(collection)
		record.Set("project", projectID)
		record.Set("name", label.Name)
		record.Set("color", label.Color)
		if err := app.Save(record); err != nil {
			return err
		}
	}
	return nil
}

func decodeRecordJSON(value any, target any) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, target)
}
