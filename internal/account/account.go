package account

import (
	"github.com/pocketbase/pocketbase/core"
)

const usersCollection = "users"

// Register wires account-deactivation ("soft delete") behaviour onto the users
// collection. Hard-deleting a user cascades to all of their projects, tasks,
// docs, calendar events and chat history — and orphans shared team data — so
// account removal is modelled as deactivation instead. This package enforces
// the rules that make the flag meaningful:
//
//   - a deactivated account cannot obtain or refresh auth tokens;
//   - deactivating rotates the token key so already-issued tokens stop working
//     immediately;
//   - only a superuser may clear the flag (users cannot reactivate themselves).
func Register(app core.App) {
	app.OnRecordAuthRequest(usersCollection).BindFunc(func(event *core.RecordAuthRequestEvent) error {
		if event.Record != nil && event.Record.GetBool("deactivated") {
			return event.ForbiddenError("This account has been deactivated.", nil)
		}
		return event.Next()
	})

	app.OnRecordUpdateRequest(usersCollection).BindFunc(guardDeactivation)
}

func guardDeactivation(event *core.RecordRequestEvent) error {
	before := event.Record.Original().GetBool("deactivated")
	after := event.Record.GetBool("deactivated")

	switch {
	case before == after:
		// The deactivated flag is unchanged; nothing to enforce.
	case before && !after && !event.HasSuperuserAuth():
		return event.ForbiddenError("Reactivating an account requires an administrator.", nil)
	case !before && after:
		// Invalidate every already-issued token for the account being
		// deactivated so live sessions cannot outlive the deactivation.
		event.Record.RefreshTokenKey()
	}

	return event.Next()
}
