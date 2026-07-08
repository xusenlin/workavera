package contacts

import (
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

const contactFavoritesCollection = "contact_favorites"

// Register attaches contacts record hooks to the application.
func Register(app core.App) {
	app.OnRecordCreateRequest(contactFavoritesCollection).BindFunc(validateContactFavorite)
}

func validateContactFavorite(event *core.RecordRequestEvent) error {
	ownerID := event.Record.GetString("owner")
	contactID := event.Record.GetString("contact")
	if event.Auth != nil && ownerID != event.Auth.Id {
		return event.ForbiddenError("You can only create favorites for yourself.", nil)
	}
	if strings.TrimSpace(ownerID) == strings.TrimSpace(contactID) {
		return event.BadRequestError("You cannot favorite yourself.", nil)
	}
	return event.Next()
}
