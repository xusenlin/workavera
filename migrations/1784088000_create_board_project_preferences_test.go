package migrations

import (
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestBoardProjectPreferencesCollectionMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	preferences, err := app.FindCollectionByNameOrId(boardProjectPreferencesCollection)
	if err != nil {
		t.Fatal(err)
	}
	user, ok := preferences.Fields.GetByName("user").(*core.RelationField)
	if !ok || !user.Required || !user.CascadeDelete || user.MaxSelect != 1 {
		t.Fatalf("unexpected project order user relation: %#v", user)
	}
	project, ok := preferences.Fields.GetByName("project").(*core.RelationField)
	if !ok || !project.Required || !project.CascadeDelete || project.MaxSelect != 1 {
		t.Fatalf("unexpected project order project relation: %#v", project)
	}
	if _, ok := preferences.Fields.GetByName("sort_order").(*core.NumberField); !ok {
		t.Fatal("project preferences must expose sort_order")
	}
	if _, ok := preferences.Fields.GetByName("collapsed").(*core.BoolField); !ok {
		t.Fatal("project preferences must expose collapsed")
	}
	if preferences.ListRule == nil || preferences.ViewRule == nil || *preferences.ListRule != *preferences.ViewRule {
		t.Fatal("project order list and view rules must match")
	}
	if preferences.CreateRule == nil || preferences.UpdateRule == nil || preferences.DeleteRule == nil {
		t.Fatal("users must be able to manage their own visible project orders")
	}
	foundUnique := false
	for _, index := range preferences.Indexes {
		lower := strings.ToLower(index)
		if strings.Contains(lower, "unique") && strings.Contains(lower, "user") && strings.Contains(lower, "project") {
			foundUnique = true
			break
		}
	}
	if !foundUnique {
		t.Fatalf("expected unique user/project index, got %v", preferences.Indexes)
	}
}

func TestBoardProjectPreferencesBackfillAndRollback(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	if err := dropBoardProjectPreferencesCollection(app); err != nil {
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

	if err := createBoardProjectPreferencesCollection(app); err != nil {
		t.Fatal(err)
	}
	for _, userID := range []string{owner.Id, member.Id} {
		records, err := app.FindRecordsByFilter(
			boardProjectPreferencesCollection,
			"user = {:user} && project = {:project}",
			"",
			0,
			0,
			dbx.Params{"user": userID, "project": project.Id},
		)
		if err != nil || len(records) != 1 || records[0].GetFloat("sort_order") != boardProjectPreferenceBase+boardProjectPreferenceStep || records[0].GetBool("collapsed") {
			t.Fatalf("unexpected backfilled order for %s: %#v, %v", userID, records, err)
		}
	}
	if err := dropBoardProjectPreferencesCollection(app); err != nil {
		t.Fatal(err)
	}
	if _, err := app.FindCollectionByNameOrId(boardProjectPreferencesCollection); err == nil {
		t.Fatal("expected board project preferences collection to be removed")
	}
}
