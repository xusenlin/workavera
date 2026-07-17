package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const notificationManagementIndex = "idx_notifications_recipient_status_pinned_created"

func init() {
	m.Register(addNotificationManagement, dropNotificationManagement)
}

func addNotificationManagement(app core.App) error {
	notifications, err := app.FindCollectionByNameOrId(notificationsCollection)
	if err != nil {
		return err
	}

	notifications.Fields.Add(
		&core.SelectField{Name: "status", Required: true, MaxSelect: 1, Values: []string{"active", "archived"}},
		&core.BoolField{Name: "pinned"},
	)
	notifications.UpdateRule = types.Pointer(`recipient = @request.auth.id && @request.body.recipient:changed = false && @request.body.type:changed = false && @request.body.title:changed = false && @request.body.body:changed = false && @request.body.data:changed = false && @request.body.dedupe_key:changed = false`)
	notifications.DeleteRule = types.Pointer(`recipient = @request.auth.id`)
	notifications.AddIndex(notificationManagementIndex, false, "recipient, status, pinned, created", "")
	if err := app.Save(notifications); err != nil {
		return err
	}

	_, err = app.DB().NewQuery("UPDATE {{notifications}} SET status = 'active' WHERE status = '' OR status IS NULL").Execute()
	return err
}

func dropNotificationManagement(app core.App) error {
	notifications, err := app.FindCollectionByNameOrId(notificationsCollection)
	if err != nil {
		return err
	}

	notifications.RemoveIndex(notificationManagementIndex)
	notifications.Fields.RemoveByName("status")
	notifications.Fields.RemoveByName("pinned")
	notifications.UpdateRule = nil
	notifications.DeleteRule = nil
	return app.Save(notifications)
}
