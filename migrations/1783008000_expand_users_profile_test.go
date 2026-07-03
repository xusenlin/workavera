package migrations

import (
	"reflect"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestExpandAndRollbackUsersProfile(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	if err := expandUsersProfile(app); err != nil {
		t.Fatalf("expand users profile: %v", err)
	}

	collection, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		t.Fatal(err)
	}

	if collection.CreateRule != nil {
		t.Fatalf("expected public create access to be locked, got %q", *collection.CreateRule)
	}
	if collection.ListRule == nil || *collection.ListRule != `@request.auth.id != ""` {
		t.Fatalf("unexpected list rule: %v", collection.ListRule)
	}

	name, ok := collection.Fields.GetByName("name").(*core.TextField)
	if !ok || !name.Required || name.Max != 100 || !name.Presentable {
		t.Fatalf("unexpected name field: %#v", name)
	}

	avatar, ok := collection.Fields.GetByName("avatar").(*core.FileField)
	if !ok || avatar.MaxSize != avatarMaxSize || avatar.MaxSelect != 1 {
		t.Fatalf("unexpected avatar field: %#v", avatar)
	}
	if !reflect.DeepEqual(avatar.MimeTypes, avatarMimeTypes) {
		t.Fatalf("unexpected avatar mime types: %v", avatar.MimeTypes)
	}

	assertTextField(t, collection, "phone", 32)
	assertTextField(t, collection, "title", 120)
	assertTextField(t, collection, "bio", 1000)

	status, ok := collection.Fields.GetByName("status").(*core.SelectField)
	if !ok || !reflect.DeepEqual(status.Values, []string{"online", "away", "busy", "offline"}) {
		t.Fatalf("unexpected status field: %#v", status)
	}

	if err := rollbackUsersProfile(app); err != nil {
		t.Fatalf("rollback users profile: %v", err)
	}

	collection, err = app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"phone", "title", "bio", "status"} {
		if collection.Fields.GetByName(field) != nil {
			t.Fatalf("expected %q to be removed", field)
		}
	}

	name, ok = collection.Fields.GetByName("name").(*core.TextField)
	if !ok || name.Required || name.Max != 255 {
		t.Fatalf("unexpected rolled back name field: %#v", name)
	}
	avatar, ok = collection.Fields.GetByName("avatar").(*core.FileField)
	if !ok || avatar.MaxSize != 0 {
		t.Fatalf("unexpected rolled back avatar field: %#v", avatar)
	}
	if collection.CreateRule == nil || *collection.CreateRule != "" {
		t.Fatalf("expected public create rule to be restored")
	}
}

func assertTextField(t *testing.T, collection *core.Collection, name string, max int) {
	t.Helper()
	field, ok := collection.Fields.GetByName(name).(*core.TextField)
	if !ok || field.Max != max {
		t.Fatalf("unexpected %s field: %#v", name, field)
	}
}
