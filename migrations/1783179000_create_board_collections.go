package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	boardTemplatesCollection      = "board_templates"
	boardProjectsCollection       = "board_projects"
	boardProjectStatesCollection  = "board_project_states"
	boardProjectMembersCollection = "board_project_members"
	boardProjectLabelsCollection  = "board_project_labels"
	boardTasksCollection          = "board_tasks"
)

type boardTemplateSeed struct {
	name        string
	description string
	states      []map[string]any
	labels      []map[string]any
}

var boardTemplateSeeds = []boardTemplateSeed{
	{
		name:        "Software Development",
		description: "Plan, build, test, and ship software work.",
		states: []map[string]any{
			{"name": "Todo", "color": "#64748b", "category": "pending"},
			{"name": "In Progress", "color": "#3b82f6", "category": "active"},
			{"name": "Testing", "color": "#f59e0b", "category": "active"},
			{"name": "Done", "color": "#22c55e", "category": "completed"},
		},
		labels: []map[string]any{
			{"name": "Bug", "color": "#ef4444"},
			{"name": "Feature", "color": "#3b82f6"},
			{"name": "Design", "color": "#a855f7"},
			{"name": "Docs", "color": "#14b8a6"},
			{"name": "Refactor", "color": "#6366f1"},
			{"name": "API", "color": "#ec4899"},
			{"name": "Performance", "color": "#22c55e"},
		},
	},
	{
		name:        "Simple Kanban",
		description: "A lightweight flow for small projects and everyday work.",
		states: []map[string]any{
			{"name": "Backlog", "color": "#64748b", "category": "pending"},
			{"name": "In Progress", "color": "#3b82f6", "category": "active"},
			{"name": "Done", "color": "#22c55e", "category": "completed"},
		},
		labels: []map[string]any{
			{"name": "Blocked", "color": "#ef4444"},
			{"name": "Improvement", "color": "#8b5cf6"},
		},
	},
	{
		name:        "Content Production",
		description: "Move articles, videos, and campaigns from idea to publication.",
		states: []map[string]any{
			{"name": "Ideas", "color": "#64748b", "category": "pending"},
			{"name": "Drafting", "color": "#3b82f6", "category": "active"},
			{"name": "Review", "color": "#f59e0b", "category": "active"},
			{"name": "Published", "color": "#22c55e", "category": "completed"},
		},
		labels: []map[string]any{
			{"name": "Article", "color": "#3b82f6"},
			{"name": "Video", "color": "#a855f7"},
			{"name": "Social", "color": "#ec4899"},
			{"name": "Campaign", "color": "#f59e0b"},
		},
	},
	{
		name:        "Issue Tracking",
		description: "Triage, resolve, and verify bugs and operational issues.",
		states: []map[string]any{
			{"name": "Reported", "color": "#64748b", "category": "pending"},
			{"name": "Triaged", "color": "#8b5cf6", "category": "pending"},
			{"name": "In Progress", "color": "#3b82f6", "category": "active"},
			{"name": "Verification", "color": "#f59e0b", "category": "active"},
			{"name": "Resolved", "color": "#22c55e", "category": "completed"},
		},
		labels: []map[string]any{
			{"name": "Bug", "color": "#ef4444"},
			{"name": "Incident", "color": "#f97316"},
			{"name": "Regression", "color": "#8b5cf6"},
			{"name": "Security", "color": "#dc2626"},
		},
	},
}

func init() {
	m.Register(createBoardCollections, dropBoardCollections)
}

func createBoardCollections(app core.App) error {
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}

	templates := core.NewBaseCollection(boardTemplatesCollection)
	templates.ListRule = types.Pointer(`@request.auth.id != "" && (owner = "" || owner = @request.auth.id)`)
	templates.ViewRule = templates.ListRule
	templates.CreateRule = types.Pointer(`@request.auth.id != "" && @request.body.owner = @request.auth.id`)
	templates.UpdateRule = types.Pointer(`owner = @request.auth.id && @request.body.owner:changed = false`)
	templates.DeleteRule = types.Pointer(`owner = @request.auth.id`)
	templates.Fields.Add(
		&core.TextField{Name: "name", Required: true, Max: 120, Presentable: true},
		&core.TextField{Name: "description", Max: 1000},
		&core.RelationField{Name: "owner", CollectionId: users.Id, MaxSelect: 1},
		&core.JSONField{Name: "states", Required: true, MaxSize: 64 * 1024},
		&core.JSONField{Name: "labels", MaxSize: 64 * 1024},
	)
	addBoardTimestamps(templates)
	templates.AddIndex("idx_board_templates_owner_name", true, "owner, name", "")
	if err := app.Save(templates); err != nil {
		return err
	}

	projects := core.NewBaseCollection(boardProjectsCollection)
	projects.Fields.Add(
		&core.TextField{Name: "name", Required: true, Max: 160, Presentable: true},
		&core.TextField{Name: "description", Max: 2000},
		&core.RelationField{Name: "owner", CollectionId: users.Id, MaxSelect: 1, Required: true},
		&core.BoolField{Name: "archived"},
	)
	addBoardTimestamps(projects)
	if err := app.Save(projects); err != nil {
		return err
	}

	states := core.NewBaseCollection(boardProjectStatesCollection)
	states.Fields.Add(
		&core.RelationField{Name: "project", CollectionId: projects.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.TextField{Name: "name", Required: true, Max: 100, Presentable: true},
		&core.TextField{Name: "color", Required: true, Max: 20},
		&core.SelectField{Name: "category", Required: true, MaxSelect: 1, Values: []string{"pending", "active", "completed"}},
		&core.NumberField{Name: "sort_order", Required: true},
	)
	addBoardTimestamps(states)
	states.AddIndex("idx_board_states_project_name", true, "project, name", "")
	states.AddIndex("idx_board_states_project_order", false, "project, sort_order", "")
	if err := app.Save(states); err != nil {
		return err
	}

	members := core.NewBaseCollection(boardProjectMembersCollection)
	members.Fields.Add(
		&core.RelationField{Name: "project", CollectionId: projects.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.RelationField{Name: "user", CollectionId: users.Id, MaxSelect: 1, Required: true},
		&core.SelectField{Name: "role", Required: true, MaxSelect: 1, Values: []string{"owner", "admin", "member", "viewer"}},
	)
	addBoardTimestamps(members)
	members.AddIndex("idx_board_members_project_user", true, "project, user", "")
	if err := app.Save(members); err != nil {
		return err
	}

	labels := core.NewBaseCollection(boardProjectLabelsCollection)
	labels.Fields.Add(
		&core.RelationField{Name: "project", CollectionId: projects.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.TextField{Name: "name", Required: true, Max: 80, Presentable: true},
		&core.TextField{Name: "color", Required: true, Max: 20},
	)
	addBoardTimestamps(labels)
	labels.AddIndex("idx_board_labels_project_name", true, "project, name", "")
	if err := app.Save(labels); err != nil {
		return err
	}

	tasks := core.NewBaseCollection(boardTasksCollection)
	tasks.Fields.Add(
		&core.RelationField{Name: "project", CollectionId: projects.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.RelationField{Name: "state", CollectionId: states.Id, MaxSelect: 1, Required: true},
		&core.TextField{Name: "title", Required: true, Max: 240, Presentable: true},
		&core.TextField{Name: "description", Max: 10000},
		&core.SelectField{Name: "priority", Required: true, MaxSelect: 1, Values: []string{"low", "medium", "high", "urgent"}},
		&core.NumberField{Name: "rank"},
		&core.DateField{Name: "due_date"},
		&core.RelationField{Name: "assignees", CollectionId: users.Id, MaxSelect: 20},
		&core.RelationField{Name: "labels", CollectionId: labels.Id, MaxSelect: 20},
		&core.RelationField{Name: "created_by", CollectionId: users.Id, MaxSelect: 1, Required: true},
	)
	addBoardTimestamps(tasks)
	tasks.AddIndex("idx_board_tasks_project_state_rank", false, "project, state, rank", "")
	if err := app.Save(tasks); err != nil {
		return err
	}

	if err := configureBoardRules(app, projects, states, members, labels, tasks); err != nil {
		return err
	}

	for _, seed := range boardTemplateSeeds {
		record := core.NewRecord(templates)
		record.Set("name", seed.name)
		record.Set("description", seed.description)
		record.Set("states", seed.states)
		record.Set("labels", seed.labels)
		if err := app.Save(record); err != nil {
			return err
		}
	}

	return nil
}

func addBoardTimestamps(collection *core.Collection) {
	collection.Fields.Add(
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
}

func configureBoardRules(app core.App, projects, states, members, labels, tasks *core.Collection) error {
	projectRead := `@request.auth.id != "" && (owner = @request.auth.id || board_project_members_via_project.user ?= @request.auth.id)`
	childRead := `@request.auth.id != "" && (project.owner = @request.auth.id || project.board_project_members_via_project.user ?= @request.auth.id)`
	projectOwner := `project.owner = @request.auth.id`

	projects.ListRule = types.Pointer(projectRead)
	projects.ViewRule = projects.ListRule
	projects.CreateRule = nil
	projects.UpdateRule = types.Pointer(`owner = @request.auth.id && @request.body.owner:changed = false`)
	projects.DeleteRule = types.Pointer(`owner = @request.auth.id`)

	states.ListRule = types.Pointer(childRead)
	states.ViewRule = states.ListRule
	states.CreateRule = types.Pointer(projectOwner)
	states.UpdateRule = types.Pointer(projectOwner + ` && @request.body.project:changed = false`)
	states.DeleteRule = types.Pointer(projectOwner)

	members.ListRule = types.Pointer(childRead)
	members.ViewRule = members.ListRule
	members.CreateRule = types.Pointer(projectOwner)
	members.UpdateRule = types.Pointer(projectOwner + ` && @request.body.project:changed = false`)
	members.DeleteRule = types.Pointer(projectOwner + ` && role != "owner"`)

	labels.ListRule = types.Pointer(childRead)
	labels.ViewRule = labels.ListRule
	labels.CreateRule = types.Pointer(projectOwner)
	labels.UpdateRule = types.Pointer(projectOwner + ` && @request.body.project:changed = false`)
	labels.DeleteRule = types.Pointer(projectOwner)

	taskWrite := `project.owner = @request.auth.id || project.board_project_members_via_project.user ?= @request.auth.id`
	tasks.ListRule = types.Pointer(childRead)
	tasks.ViewRule = tasks.ListRule
	tasks.CreateRule = types.Pointer(taskWrite)
	tasks.UpdateRule = types.Pointer(`(` + taskWrite + `) && @request.body.project:changed = false && @request.body.created_by:changed = false`)
	tasks.DeleteRule = types.Pointer(taskWrite)

	for _, collection := range []*core.Collection{projects, states, members, labels, tasks} {
		if err := app.Save(collection); err != nil {
			return err
		}
	}
	return nil
}

func dropBoardCollections(app core.App) error {
	for _, name := range []string{
		boardTasksCollection,
		boardProjectLabelsCollection,
		boardProjectMembersCollection,
		boardProjectStatesCollection,
		boardProjectsCollection,
		boardTemplatesCollection,
	} {
		collection, err := app.FindCollectionByNameOrId(name)
		if err != nil {
			return err
		}
		if err := app.Delete(collection); err != nil {
			return err
		}
	}
	return nil
}
