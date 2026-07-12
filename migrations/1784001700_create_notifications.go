package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const notificationsCollection = "notifications"

func init() {
	m.Register(createNotificationsCollections, dropNotificationsCollections)
}

func createNotificationsCollections(app core.App) error {
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}

	notifications := core.NewBaseCollection(notificationsCollection)
	notifications.Fields.Add(
		&core.RelationField{Name: "recipient", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.SelectField{Name: "type", Required: true, MaxSelect: 1, Values: []string{"model_share", "task_due", "calendar_event"}},
		&core.TextField{Name: "title", Required: true, Max: 240, Presentable: true},
		&core.TextField{Name: "body", Max: 4000},
		&core.JSONField{Name: "data", MaxSize: 64 * 1024},
		&core.DateField{Name: "read_at"},
		&core.TextField{Name: "dedupe_key", Required: true, Max: 500, Hidden: true},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	notifications.AddIndex("idx_notifications_recipient_created", false, "recipient, created", "")
	notifications.AddIndex("idx_notifications_recipient_read_created", false, "recipient, read_at, created", "")
	notifications.AddIndex("idx_notifications_dedupe_key", true, "dedupe_key", "")
	notifications.ListRule = types.Pointer(`recipient = @request.auth.id`)
	notifications.ViewRule = notifications.ListRule
	return app.Save(notifications)
}

func dropNotificationsCollections(app core.App) error {
	collection, err := app.FindCollectionByNameOrId(notificationsCollection)
	if err != nil {
		return err
	}
	return app.Delete(collection)
}
