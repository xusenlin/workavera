package board

import (
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	_ "github.com/xusenlin/workavera/migrations"
)

func TestTransferBoardProjectOwnerMaintainsSingleOwnerAndAudit(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	formerOwner := createQueryTestUser(t, app, "former-owner@example.com", "Former Owner")
	newOwner := createQueryTestUser(t, app, "new-owner@example.com", "New Owner")
	project := createQueryTestProject(t, app, formerOwner.Id, "Transfer", false)
	createProjectTestMembership(t, app, project.Id, newOwner.Id, "viewer")
	state := createQueryTestState(t, app, project.Id)
	task := createQueryTestTask(t, app, project.Id, state.Id, formerOwner.Id, []string{formerOwner.Id, newOwner.Id})

	if err := transferBoardProjectOwner(app, formerOwner.Id, project.Id, newOwner.Id); err != nil {
		t.Fatal(err)
	}

	updated, err := app.FindRecordById(boardProjectsCollection, project.Id)
	if err != nil {
		t.Fatal(err)
	}
	if updated.GetString("owner") != newOwner.Id {
		t.Fatalf("expected new owner %s, got %s", newOwner.Id, updated.GetString("owner"))
	}

	newOwnerMemberships, err := app.FindRecordsByFilter(
		boardProjectMembersCollection,
		"project = {:project} && user = {:user}",
		"",
		0,
		0,
		dbx.Params{"project": project.Id, "user": newOwner.Id},
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(newOwnerMemberships) != 0 {
		t.Fatalf("new owner must not retain a membership: %#v", newOwnerMemberships)
	}

	formerOwnerMembership, err := app.FindFirstRecordByFilter(
		boardProjectMembersCollection,
		"project = {:project} && user = {:user}",
		dbx.Params{"project": project.Id, "user": formerOwner.Id},
	)
	if err != nil {
		t.Fatal(err)
	}
	if formerOwnerMembership.GetString("role") != "member" {
		t.Fatalf("former owner should become member: %#v", formerOwnerMembership)
	}

	logs, err := app.FindRecordsByFilter(
		boardProjectOperationLogs,
		"project = {:project}",
		"",
		0,
		0,
		dbx.Params{"project": project.Id},
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 1 || logs[0].GetString("action") != "transfer_owner" {
		t.Fatalf("expected one ownership transfer audit record: %#v", logs)
	}

	unchangedTask, err := app.FindRecordById(boardTasksCollection, task.Id)
	if err != nil {
		t.Fatal(err)
	}
	if len(unchangedTask.GetStringSlice("assignees")) != 2 {
		t.Fatalf("ownership transfer changed task assignees: %#v", unchangedTask)
	}
}

func TestTransferBoardProjectOwnerRejectsNonOwner(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	owner := createQueryTestUser(t, app, "transfer-owner@example.com", "Owner")
	nonOwner := createQueryTestUser(t, app, "transfer-member@example.com", "Member")
	target := createQueryTestUser(t, app, "transfer-target@example.com", "Target")
	project := createQueryTestProject(t, app, owner.Id, "Protected", false)

	if err := transferBoardProjectOwner(app, nonOwner.Id, project.Id, target.Id); err != errBoardOwnerOnly {
		t.Fatalf("expected owner-only error, got %v", err)
	}
	unchanged, err := app.FindRecordById(boardProjectsCollection, project.Id)
	if err != nil {
		t.Fatal(err)
	}
	if unchanged.GetString("owner") != owner.Id {
		t.Fatal("non-owner changed project ownership")
	}
}

func TestSaveBoardProjectOperationLogSupportsProjectChanges(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	owner := createQueryTestUser(t, app, "project-activity@example.com", "Activity Owner")
	project := createQueryTestProject(t, app, owner.Id, "Activity", false)
	if err := saveBoardProjectOperationLog(
		app,
		owner,
		project.Id,
		"update_project",
		map[string]any{"name": map[string]string{"from": "Before", "to": "After"}},
	); err != nil {
		t.Fatal(err)
	}

	logs, err := app.FindRecordsByFilter(
		boardProjectOperationLogs,
		"project = {:project}",
		"",
		0,
		0,
		dbx.Params{"project": project.Id},
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 1 || logs[0].GetString("action") != "update_project" {
		t.Fatalf("expected project update activity: %#v", logs)
	}
}

func createProjectTestMembership(t *testing.T, app core.App, projectID, userID, role string) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId(boardProjectMembersCollection)
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Set("project", projectID)
	record.Set("user", userID)
	record.Set("role", role)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}
