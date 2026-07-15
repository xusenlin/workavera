package board

import (
	"context"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/tests"
	_ "github.com/xusenlin/workavera/migrations"
)

func TestProjectPreferencesFollowProjectAndMembershipCreation(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	owner := createQueryTestUser(t, app, "order-owner@example.com", "Owner")
	member := createQueryTestUser(t, app, "order-member@example.com", "Member")

	first, err := CreateProject(context.Background(), app, owner.Id, CreateProjectCommand{Name: "First"})
	if err != nil {
		t.Fatal(err)
	}
	second, err := CreateProject(context.Background(), app, owner.Id, CreateProjectCommand{Name: "Second"})
	if err != nil {
		t.Fatal(err)
	}
	ownerOrders, err := app.FindRecordsByFilter(
		boardProjectPreferencesCollection,
		"user = {:user}",
		"sort_order",
		0,
		0,
		dbx.Params{"user": owner.Id},
	)
	if err != nil || len(ownerOrders) != 2 {
		t.Fatalf("unexpected owner orders: %#v, %v", ownerOrders, err)
	}
	if ownerOrders[0].GetString("project") != second.ID || ownerOrders[1].GetString("project") != first.ID {
		t.Fatalf("new projects must be ordered first: %#v", ownerOrders)
	}

	if _, err := UpsertMember(context.Background(), app, owner.Id, UpsertMemberCommand{
		ProjectID: first.ID,
		UserID:    member.Id,
		Role:      "viewer",
	}); err != nil {
		t.Fatal(err)
	}
	memberOrders, err := app.FindRecordsByFilter(
		boardProjectPreferencesCollection,
		"user = {:user} && project = {:project}",
		"",
		0,
		0,
		dbx.Params{"user": member.Id, "project": first.ID},
	)
	if err != nil || len(memberOrders) != 1 {
		t.Fatalf("membership must create a project order: %#v, %v", memberOrders, err)
	}

	memberships, err := app.FindRecordsByFilter(
		boardProjectMembersCollection,
		"user = {:user} && project = {:project}",
		"",
		1,
		0,
		dbx.Params{"user": member.Id, "project": first.ID},
	)
	if err != nil || len(memberships) != 1 {
		t.Fatalf("missing membership: %#v, %v", memberships, err)
	}
	if err := app.Delete(memberships[0]); err != nil {
		t.Fatal(err)
	}
	if err := removeBoardProjectPreferenceIfInvisible(app, member.Id, first.ID); err != nil {
		t.Fatal(err)
	}
	memberOrders, err = app.FindRecordsByFilter(
		boardProjectPreferencesCollection,
		"user = {:user} && project = {:project}",
		"",
		0,
		0,
		dbx.Params{"user": member.Id, "project": first.ID},
	)
	if err != nil || len(memberOrders) != 0 {
		t.Fatalf("removed members must lose their project order: %#v, %v", memberOrders, err)
	}
}
