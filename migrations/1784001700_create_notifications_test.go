package migrations

import (
	"strings"
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
	if notifications.CreateRule != nil {
		t.Fatal("notification creation must remain limited to trusted server code")
	}
	if notifications.UpdateRule == nil || !strings.Contains(*notifications.UpdateRule, `recipient = @request.auth.id`) || !strings.Contains(*notifications.UpdateRule, `@request.body.data:changed = false`) {
		t.Fatalf("unexpected notification update rule: %v", notifications.UpdateRule)
	}
	if notifications.DeleteRule == nil || *notifications.DeleteRule != `recipient = @request.auth.id` {
		t.Fatalf("unexpected notification delete rule: %v", notifications.DeleteRule)
	}
	if _, ok := notifications.Fields.GetByName("data").(*core.JSONField); !ok {
		t.Fatal("notification data must be JSON")
	}
	status, ok := notifications.Fields.GetByName("status").(*core.SelectField)
	if !ok || !status.Required || strings.Join(status.Values, ",") != "active,archived" {
		t.Fatalf("unexpected notification status field: %#v", status)
	}
	if _, ok := notifications.Fields.GetByName("pinned").(*core.BoolField); !ok {
		t.Fatal("notifications must expose pinned as a boolean field")
	}
}
