package board

import (
	"context"
	"errors"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/tests"
	_ "github.com/xusenlin/workavera/migrations"
)

func TestCreateProjectFromTemplateAndBlank(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	owner := createQueryTestUser(t, app, "command-owner@example.com", "Owner")

	templates, err := ListVisibleTemplates(context.Background(), app, owner.Id)
	if err != nil || len(templates) == 0 {
		t.Fatalf("expected templates: %#v, %v", templates, err)
	}
	fromTemplate, err := CreateProject(context.Background(), app, owner.Id, CreateProjectCommand{
		Name: "Templated", TemplateID: templates[0].ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	project, err := app.FindRecordById(boardProjectsCollection, fromTemplate.ID)
	if err != nil || project.GetString("owner") != owner.Id {
		t.Fatalf("unexpected project: %#v, %v", project, err)
	}
	states, err := app.FindRecordsByFilter(boardProjectStatesCollection, "project = {:project}", "", 0, 0, dbx.Params{"project": project.Id})
	if err != nil || len(states) != len(templates[0].States) {
		t.Fatalf("template states were not copied: %#v, %v", states, err)
	}
	members, err := app.FindRecordsByFilter(boardProjectMembersCollection, "project = {:project}", "", 0, 0, dbx.Params{"project": project.Id})
	if err != nil || len(members) != 0 {
		t.Fatalf("owner must not have a membership: %#v, %v", members, err)
	}

	blank, err := CreateProject(context.Background(), app, owner.Id, CreateProjectCommand{Name: "Blank"})
	if err != nil {
		t.Fatal(err)
	}
	states, err = app.FindRecordsByFilter(boardProjectStatesCollection, "project = {:project}", "", 0, 0, dbx.Params{"project": blank.ID})
	if err != nil || len(states) != 0 {
		t.Fatalf("blank project unexpectedly has states: %#v, %v", states, err)
	}
}

func TestProjectCapabilitiesAndCommandPermissions(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	owner := createQueryTestUser(t, app, "cap-owner@example.com", "Owner")
	member := createQueryTestUser(t, app, "cap-member@example.com", "Member")
	viewer := createQueryTestUser(t, app, "cap-viewer@example.com", "Viewer")
	project := createQueryTestProject(t, app, owner.Id, "Capabilities", false)
	createProjectTestMembership(t, app, project.Id, member.Id, "member")
	createProjectTestMembership(t, app, project.Id, viewer.Id, "viewer")
	state := createQueryTestState(t, app, project.Id)

	ownerView, err := GetVisibleProject(context.Background(), app, owner.Id, project.Id)
	if err != nil || ownerView.CurrentActorRole != "owner" || !ownerView.Capabilities.CanEditProject || !ownerView.Capabilities.CanEditTasks || ownerView.Capabilities.CanDeleteProject {
		t.Fatalf("unexpected owner capabilities: %#v, %v", ownerView, err)
	}
	memberView, err := GetVisibleProject(context.Background(), app, member.Id, project.Id)
	if err != nil || memberView.CurrentActorRole != "member" || memberView.Capabilities.CanEditProject || !memberView.Capabilities.CanEditTasks {
		t.Fatalf("unexpected member capabilities: %#v, %v", memberView, err)
	}
	viewerView, err := GetVisibleProject(context.Background(), app, viewer.Id, project.Id)
	if err != nil || viewerView.CurrentActorRole != "viewer" || viewerView.Capabilities.CanEditTasks {
		t.Fatalf("unexpected viewer capabilities: %#v, %v", viewerView, err)
	}

	name := "Forbidden"
	if _, err := UpdateProject(context.Background(), app, member.Id, UpdateProjectCommand{ProjectID: project.Id, Name: &name}); !errors.Is(err, ErrOwnerOnly) {
		t.Fatalf("member updated project settings: %v", err)
	}
	if _, err := CreateTask(context.Background(), app, viewer.Id, CreateTaskCommand{ProjectID: project.Id, StateID: state.Id, Title: "Forbidden"}); !errors.Is(err, ErrTaskWriteDenied) {
		t.Fatalf("viewer created task: %v", err)
	}
	created, err := CreateTask(context.Background(), app, member.Id, CreateTaskCommand{ProjectID: project.Id, StateID: state.Id, Title: "Allowed", AssigneeIDs: []string{owner.Id}})
	if err != nil || created.ID == "" {
		t.Fatalf("member should create owner-assigned task: %#v, %v", created, err)
	}
}

func TestTaskCommandsValidateRelationsAndPatchClearsFields(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	owner := createQueryTestUser(t, app, "patch-owner@example.com", "Owner")
	outsider := createQueryTestUser(t, app, "patch-outsider@example.com", "Outsider")
	project := createQueryTestProject(t, app, owner.Id, "Patch", false)
	state := createQueryTestState(t, app, project.Id)
	otherProject := createQueryTestProject(t, app, outsider.Id, "Other", false)
	otherState := createQueryTestState(t, app, otherProject.Id)

	if _, err := CreateTask(context.Background(), app, owner.Id, CreateTaskCommand{ProjectID: project.Id, StateID: otherState.Id, Title: "Cross project"}); err == nil {
		t.Fatal("cross-project state was accepted")
	}
	if _, err := CreateTask(context.Background(), app, owner.Id, CreateTaskCommand{ProjectID: project.Id, StateID: state.Id, Title: "Outsider", AssigneeIDs: []string{outsider.Id}}); err == nil {
		t.Fatal("outside assignee was accepted")
	}

	created, err := CreateTask(context.Background(), app, owner.Id, CreateTaskCommand{
		ProjectID: project.Id, StateID: state.Id, Title: "Patch me", Priority: "none",
		DueDate: "2026-08-01", AssigneeIDs: []string{owner.Id},
	})
	if err != nil {
		t.Fatal(err)
	}
	empty := []string{}
	if _, err := UpdateTask(context.Background(), app, owner.Id, UpdateTaskCommand{
		TaskID: created.ID, DueDateSet: true, DueDate: nil,
		AssigneeIDs: &empty, LabelIDs: &empty,
	}); err != nil {
		t.Fatal(err)
	}
	task, err := app.FindRecordById(boardTasksCollection, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if task.GetString("due_date") != "" || len(task.GetStringSlice("assignees")) != 0 || task.GetString("priority") != "none" {
		t.Fatalf("patch did not preserve/clear fields correctly: %#v", task)
	}
	logs, err := app.FindRecordsByFilter(boardTaskOperationLogs, "task_id = {:task}", "", 0, 0, dbx.Params{"task": task.Id})
	if err != nil || len(logs) != 2 {
		t.Fatalf("expected create and update logs: %#v, %v", logs, err)
	}
}

func TestOwnerCommandsWriteProjectActivity(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	owner := createQueryTestUser(t, app, "activity-command@example.com", "Owner")
	member := createQueryTestUser(t, app, "activity-member@example.com", "Member")
	project := createQueryTestProject(t, app, owner.Id, "Activity", false)

	stateName, color, category := "Review", "#f59e0b", "active"
	if _, err := UpsertState(context.Background(), app, owner.Id, UpsertStateCommand{ProjectID: project.Id, Name: &stateName, Color: &color, Category: &category}); err != nil {
		t.Fatal(err)
	}
	labelName := "Docs"
	if _, err := UpsertLabel(context.Background(), app, owner.Id, UpsertLabelCommand{ProjectID: project.Id, Name: &labelName, Color: &color}); err != nil {
		t.Fatal(err)
	}
	if _, err := UpsertMember(context.Background(), app, owner.Id, UpsertMemberCommand{ProjectID: project.Id, UserID: member.Id, Role: "admin"}); err != nil {
		t.Fatal(err)
	}
	logs, err := app.FindRecordsByFilter(boardProjectOperationLogs, "project = {:project}", "", 0, 0, dbx.Params{"project": project.Id})
	if err != nil || len(logs) != 3 {
		t.Fatalf("expected state, label, and member logs: %#v, %v", logs, err)
	}
}
