package board

import (
	"context"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	_ "github.com/xusenlin/workavera/migrations"
)

func TestSearchVisibleProjectsUsesOwnerOrMemberPolicy(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	actor := createQueryTestUser(t, app, "actor@example.com", "Actor")
	other := createQueryTestUser(t, app, "other@example.com", "Other")
	owned := createQueryTestProject(t, app, actor.Id, "Owned", false)
	shared := createQueryTestProject(t, app, other.Id, "Shared", false)
	createQueryTestProject(t, app, other.Id, "Hidden", false)
	createQueryTestProject(t, app, actor.Id, "Archived", true)

	members, err := app.FindCollectionByNameOrId(boardProjectMembersCollection)
	if err != nil {
		t.Fatal(err)
	}
	membership := core.NewRecord(members)
	membership.Set("project", shared.Id)
	membership.Set("user", actor.Id)
	membership.Set("role", "member")
	if err := app.Save(membership); err != nil {
		t.Fatal(err)
	}

	result, err := SearchVisibleProjects(context.Background(), app, actor.Id, ProjectSearchOptions{Limit: 20})
	if err != nil {
		t.Fatal(err)
	}
	ids := make(map[string]bool, len(result))
	for _, project := range result {
		ids[project.ID] = true
	}
	if !ids[owned.Id] || !ids[shared.Id] || len(ids) != 2 {
		t.Fatalf("unexpected visible projects: %#v", result)
	}

	// Verify states and task counts are populated.
	for _, project := range result {
		for _, state := range project.States {
			if state.ID == "" || state.Name == "" || state.Color == "" {
				t.Fatalf("project %s has incomplete state: %#v", project.Name, state)
			}
		}
	}
}

func TestSearchVisibleProjectsFiltersByTaskAssigneeIncludingOwner(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	owner := createQueryTestUser(t, app, "owner-filter@example.com", "Owner")
	project := createQueryTestProject(t, app, owner.Id, "Assigned", false)
	state := createQueryTestState(t, app, project.Id)
	createQueryTestTask(t, app, project.Id, state.Id, owner.Id, []string{owner.Id})

	result, err := SearchVisibleProjects(context.Background(), app, owner.Id, ProjectSearchOptions{
		Limit:   20,
		UserIDs: []string{owner.Id},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(result) != 1 || result[0].ID != project.Id {
		t.Fatalf("expected project assigned to owner, got %#v", result)
	}
	if len(result[0].States) != 1 || result[0].States[0].TaskCount != 1 {
		t.Fatalf("expected bulk-loaded state task count, got %#v", result[0].States)
	}
}

func TestSearchVisibleTasksFindsKeywordsAcrossVisibleProjects(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	actor := createQueryTestUser(t, app, "task-search-actor@example.com", "Actor")
	other := createQueryTestUser(t, app, "task-search-other@example.com", "Other")
	owned := createQueryTestProject(t, app, actor.Id, "Owned project", false)
	shared := createQueryTestProject(t, app, other.Id, "Shared project", false)
	hidden := createQueryTestProject(t, app, other.Id, "Hidden project", false)
	archived := createQueryTestProject(t, app, actor.Id, "Archived project", true)

	members, err := app.FindCollectionByNameOrId(boardProjectMembersCollection)
	if err != nil {
		t.Fatal(err)
	}
	membership := core.NewRecord(members)
	membership.Set("project", shared.Id)
	membership.Set("user", actor.Id)
	membership.Set("role", "member")
	if err := app.Save(membership); err != nil {
		t.Fatal(err)
	}

	ownedState := createQueryTestState(t, app, owned.Id)
	sharedState := createQueryTestState(t, app, shared.Id)
	hiddenState := createQueryTestState(t, app, hidden.Id)
	archivedState := createQueryTestState(t, app, archived.Id)
	setQueryTestTaskText(t, app, createQueryTestTask(t, app, owned.Id, ownedState.Id, actor.Id, []string{actor.Id}), "memory index", "")
	setQueryTestTaskText(t, app, createQueryTestTask(t, app, shared.Id, sharedState.Id, other.Id, []string{other.Id}), "Shared work", "add memory search")
	setQueryTestTaskText(t, app, createQueryTestTask(t, app, hidden.Id, hiddenState.Id, other.Id, []string{other.Id}), "memory secret", "")
	setQueryTestTaskText(t, app, createQueryTestTask(t, app, archived.Id, archivedState.Id, actor.Id, []string{actor.Id}), "memory archive", "")

	result, err := SearchVisibleTasks(context.Background(), app, actor.Id, TaskSearchOptions{Query: "memory", Limit: 20})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Tasks) != 2 {
		t.Fatalf("expected matches from two visible active projects, got %#v", result.Tasks)
	}
	projects := make(map[string]bool, len(result.Tasks))
	for _, task := range result.Tasks {
		projects[task.Project.ID] = true
		if task.Project.Name == "" || task.State.ID != task.StateID || task.State.Name != "Todo" || task.State.ProjectID != task.Project.ID {
			t.Fatalf("task is missing resolved project/state data: %#v", task)
		}
	}
	if !projects[owned.Id] || !projects[shared.Id] || projects[hidden.Id] || projects[archived.Id] {
		t.Fatalf("unexpected project visibility in task results: %#v", projects)
	}

	withArchived, err := SearchVisibleTasks(context.Background(), app, actor.Id, TaskSearchOptions{
		Query:           "memory",
		IncludeArchived: true,
		Limit:           20,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(withArchived.Tasks) != 3 {
		t.Fatalf("expected archived visible match, got %#v", withArchived.Tasks)
	}
}

func TestSearchVisibleTasksRequiresProjectOrQueryAndPreservesProjectListing(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	owner := createQueryTestUser(t, app, "task-list-owner@example.com", "Owner")
	project := createQueryTestProject(t, app, owner.Id, "Project", false)
	state := createQueryTestState(t, app, project.Id)
	task := createQueryTestTask(t, app, project.Id, state.Id, owner.Id, []string{owner.Id})

	if _, err := SearchVisibleTasks(context.Background(), app, owner.Id, TaskSearchOptions{}); err == nil {
		t.Fatal("expected project-less search without a query to fail")
	}
	result, err := SearchVisibleTasks(context.Background(), app, owner.Id, TaskSearchOptions{ProjectID: project.Id})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Tasks) != 1 || result.Tasks[0].ID != task.Id || result.Tasks[0].Project.ID != project.Id || result.Tasks[0].State.ID != state.Id {
		t.Fatalf("unexpected project task listing: %#v", result)
	}
}

func createQueryTestUser(t *testing.T, app core.App, email, name string) *core.Record {
	t.Helper()
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(users)
	record.SetEmail(email)
	record.SetPassword("password123")
	record.Set("name", name)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func createQueryTestProject(t *testing.T, app core.App, ownerID, name string, archived bool) *core.Record {
	t.Helper()
	projects, err := app.FindCollectionByNameOrId(boardProjectsCollection)
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(projects)
	record.Set("owner", ownerID)
	record.Set("name", name)
	record.Set("archived", archived)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func createQueryTestState(t *testing.T, app core.App, projectID string) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId(boardProjectStatesCollection)
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Set("project", projectID)
	record.Set("name", "Todo")
	record.Set("color", "#64748b")
	record.Set("category", "pending")
	record.Set("sort_order", 1024)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func createQueryTestTask(t *testing.T, app core.App, projectID, stateID, creatorID string, assignees []string) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId(boardTasksCollection)
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Set("project", projectID)
	record.Set("state", stateID)
	record.Set("title", "Assigned task")
	record.Set("priority", "medium")
	record.Set("assignees", assignees)
	record.Set("created_by", creatorID)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func setQueryTestTaskText(t *testing.T, app core.App, task *core.Record, title, description string) {
	t.Helper()
	task.Set("title", title)
	task.Set("description", description)
	if err := app.Save(task); err != nil {
		t.Fatal(err)
	}
}
