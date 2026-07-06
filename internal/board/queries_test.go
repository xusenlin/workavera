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
