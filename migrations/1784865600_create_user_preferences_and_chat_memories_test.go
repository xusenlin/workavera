package migrations

import (
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestUserPreferencesAndChatMemoriesMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	preferences, err := app.FindCollectionByNameOrId(userPreferencesCollection)
	if err != nil {
		t.Fatal(err)
	}
	owner, ok := preferences.Fields.GetByName("owner").(*core.RelationField)
	if !ok || !owner.Required || !owner.CascadeDelete || owner.MaxSelect != 1 {
		t.Fatalf("unexpected preference owner field: %#v", owner)
	}
	if _, ok := preferences.Fields.GetByName("theme").(*core.SelectField); !ok {
		t.Fatal("user preferences must expose a typed theme")
	}
	if _, ok := preferences.Fields.GetByName("memory_enabled").(*core.BoolField); !ok {
		t.Fatal("user preferences must expose memory_enabled")
	}
	if preferences.ListRule == nil || preferences.ViewRule == nil || preferences.UpdateRule == nil || preferences.CreateRule != nil || preferences.DeleteRule != nil {
		t.Fatal("unexpected user preference API rules")
	}
	foundUniqueOwner := false
	for _, index := range preferences.Indexes {
		lower := strings.ToLower(index)
		if strings.Contains(lower, "unique") && strings.Contains(lower, "owner") {
			foundUniqueOwner = true
		}
	}
	if !foundUniqueOwner {
		t.Fatalf("preferences must have a unique owner index: %v", preferences.Indexes)
	}

	memories, err := app.FindCollectionByNameOrId(chatMemoriesCollection)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"owner", "category", "content", "active", "origin", "source_conversation", "source_message", "created", "updated"} {
		if memories.Fields.GetByName(name) == nil {
			t.Fatalf("chat memories missing field %s", name)
		}
	}
	if memories.ListRule == nil || memories.ViewRule == nil || memories.CreateRule == nil || memories.UpdateRule == nil || memories.DeleteRule == nil {
		t.Fatal("chat memories must have owner-scoped API rules")
	}

	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		t.Fatal(err)
	}
	if users.Fields.GetByName("theme") != nil {
		t.Fatal("theme must move from users to user_preferences")
	}
}

func TestUserPreferenceThemeRoundTrip(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	preferences, err := app.FindRecordsByFilter(userPreferencesCollection, "", "", 1, 0)
	if err != nil || len(preferences) != 1 {
		t.Fatalf("expected a backfilled preference: %#v, %v", preferences, err)
	}
	preference := preferences[0]
	ownerID := preference.GetString("owner")
	owner, err := app.FindRecordById(usersCollectionName, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	if owner.GetString("name") == "" {
		owner.Set("name", "Theme Round Trip")
		if err := app.Save(owner); err != nil {
			t.Fatal(err)
		}
	}
	preference.Set("theme", "dark")
	if err := app.Save(preference); err != nil {
		t.Fatal(err)
	}

	if err := dropUserPreferencesAndChatMemories(app); err != nil {
		t.Fatal(err)
	}
	user, err := app.FindRecordById(usersCollectionName, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	if user.GetString("theme") != "dark" {
		t.Fatalf("rollback did not restore the current theme: %q", user.GetString("theme"))
	}

	if err := createUserPreferencesAndChatMemories(app); err != nil {
		t.Fatal(err)
	}
	recreated, err := app.FindFirstRecordByFilter(userPreferencesCollection, "owner = {:owner}", dbx.Params{"owner": ownerID})
	if err != nil {
		t.Fatal(err)
	}
	if recreated.GetString("theme") != "dark" || recreated.GetBool("memory_enabled") || recreated.GetBool("memory_auto_capture") {
		t.Fatalf("unexpected recreated preference: %#v", recreated)
	}
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		t.Fatal(err)
	}
	if users.Fields.GetByName("theme") != nil {
		t.Fatal("forward migration must remove users.theme again")
	}
}
