package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(addUserDeactivated, dropUserDeactivated)
}

// addUserDeactivated introduces a soft-delete flag on the users collection.
// Hard-deleting a user record cascades to every project, task, doc, calendar
// event and chat message they own — and orphans shared team data such as task
// assignees and doc authorship — so account removal is modelled as
// deactivation instead. The owner can flip this flag on to "delete" their
// account (UpdateRule already allows self edits); server hooks then block auth
// and self-reactivation. Actual purging is left to an administrator.
func addUserDeactivated(app core.App) error {
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}
	users.Fields.Add(&core.BoolField{
		Name: "deactivated",
	})
	return app.Save(users)
}

func dropUserDeactivated(app core.App) error {
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}
	users.Fields.RemoveByName("deactivated")
	return app.Save(users)
}
