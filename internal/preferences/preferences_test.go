package preferences

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	_ "github.com/xusenlin/workavera/migrations"
)

func TestRegisterCreatesDefaultPreferencesForNewUser(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	Register(app)

	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	user := core.NewRecord(users)
	user.SetEmail("preferences-test@example.com")
	user.SetPassword("password123")
	user.Set("name", "Preferences Test")
	if err := app.Save(user); err != nil {
		t.Fatal(err)
	}

	preference, err := Get(app, user.Id)
	if err != nil {
		t.Fatal(err)
	}
	if preference.Theme != "system" || preference.MemoryEnabled || preference.MemoryAutoCapture {
		t.Fatalf("unexpected defaults: %#v", preference)
	}
	if ensured, err := Ensure(app, user.Id); err != nil || ensured.ID != preference.ID {
		t.Fatalf("ensure must reuse the one preference record: %#v, %v", ensured, err)
	}
}
