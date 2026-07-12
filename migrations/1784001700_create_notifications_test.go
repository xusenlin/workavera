package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestNotificationsMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	notifications, err := app.FindCollectionByNameOrId(notificationsCollection)
	if err != nil {
		t.Fatal(err)
	}
	if notifications.ListRule == nil || *notifications.ListRule != `recipient = @request.auth.id` {
		t.Fatalf("unexpected notification list rule: %v", notifications.ListRule)
	}
	if notifications.CreateRule != nil || notifications.UpdateRule != nil || notifications.DeleteRule != nil {
		t.Fatal("notification mutations must use trusted server APIs")
	}
	if _, ok := notifications.Fields.GetByName("data").(*core.JSONField); !ok {
		t.Fatal("notification data must be JSON")
	}
}
