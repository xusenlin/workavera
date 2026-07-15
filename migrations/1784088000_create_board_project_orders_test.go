package migrations

import (
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestBoardProjectOrdersCollectionMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	orders, err := app.FindCollectionByNameOrId(boardProjectOrdersCollection)
	if err != nil {
		t.Fatal(err)
	}
	user, ok := orders.Fields.GetByName("user").(*core.RelationField)
	if !ok || !user.Required || !user.CascadeDelete || user.MaxSelect != 1 {
		t.Fatalf("unexpected project order user relation: %#v", user)
	}
	project, ok := orders.Fields.GetByName("project").(*core.RelationField)
	if !ok || !project.Required || !project.CascadeDelete || project.MaxSelect != 1 {
		t.Fatalf("unexpected project order project relation: %#v", project)
	}
	if _, ok := orders.Fields.GetByName("sort_order").(*core.NumberField); !ok {
		t.Fatal("project orders must expose sort_order")
	}
	if orders.ListRule == nil || orders.ViewRule == nil || *orders.ListRule != *orders.ViewRule {
		t.Fatal("project order list and view rules must match")
	}
	if orders.CreateRule == nil || orders.UpdateRule == nil || orders.DeleteRule == nil {
		t.Fatal("users must be able to manage their own visible project orders")
	}
	foundUnique := false
	for _, index := range orders.Indexes {
		lower := strings.ToLower(index)
		if strings.Contains(lower, "unique") && strings.Contains(lower, "user") && strings.Contains(lower, "project") {
			foundUnique = true
			break
		}
	}
	if !foundUnique {
		t.Fatalf("expected unique user/project index, got %v", orders.Indexes)
	}
}

func TestBoardProjectOrdersBackfillAndRollback(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	if err := dropBoardProjectOrdersCollection(app); err != nil {
		t.Fatal(err)
	}
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		t.Fatal(err)
	}
	newUser := func(email string) *core.Record {
		record := core.NewRecord(users)
		record.SetEmail(email)
		record.SetPassword("password123")
		record.Set("name", email)
		if err := app.Save(record); err != nil {
			t.Fatal(err)
		}
		return record
	}
	owner := newUser("project-order-owner@example.com")
	member := newUser("project-order-member@example.com")

	projects, err := app.FindCollectionByNameOrId(boardProjectsCollection)
	if err != nil {
		t.Fatal(err)
	}
	project := core.NewRecord(projects)
	project.Set("name", "Ordered project")
	project.Set("owner", owner.Id)
	if err := app.Save(project); err != nil {
		t.Fatal(err)
	}
	members, err := app.FindCollectionByNameOrId(boardProjectMembersCollection)
	if err != nil {
		t.Fatal(err)
	}
	membership := core.NewRecord(members)
	membership.Set("project", project.Id)
	membership.Set("user", member.Id)
	membership.Set("role", "member")
	if err := app.Save(membership); err != nil {
		t.Fatal(err)
	}

	if err := createBoardProjectOrdersCollection(app); err != nil {
		t.Fatal(err)
	}
	for _, userID := range []string{owner.Id, member.Id} {
		records, err := app.FindRecordsByFilter(
			boardProjectOrdersCollection,
			"user = {:user} && project = {:project}",
			"",
			0,
			0,
			dbx.Params{"user": userID, "project": project.Id},
		)
		if err != nil || len(records) != 1 || records[0].GetFloat("sort_order") != boardProjectOrderBase+boardProjectOrderStep {
			t.Fatalf("unexpected backfilled order for %s: %#v, %v", userID, records, err)
		}
	}
	if err := dropBoardProjectOrdersCollection(app); err != nil {
		t.Fatal(err)
	}
	if _, err := app.FindCollectionByNameOrId(boardProjectOrdersCollection); err == nil {
		t.Fatal("expected board project orders collection to be removed")
	}
}
