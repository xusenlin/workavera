package preferences

import (
	"errors"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const CollectionName = "user_preferences"

type Preferences struct {
	ID                string `json:"id"`
	Owner             string `json:"owner"`
	Theme             string `json:"theme"`
	MemoryEnabled     bool   `json:"memory_enabled"`
	MemoryAutoCapture bool   `json:"memory_auto_capture"`
	Created           string `json:"created"`
	Updated           string `json:"updated"`
}

func Register(app core.App) {
	app.OnRecordAfterCreateSuccess("users").BindFunc(func(event *core.RecordEvent) error {
		if _, err := Ensure(event.App, event.Record.Id); err != nil {
			event.App.Logger().Error("failed to create user preferences", "userId", event.Record.Id, "error", err)
		}
		return event.Next()
	})
}

func Get(app core.App, ownerID string) (Preferences, error) {
	if ownerID == "" {
		return Preferences{}, errors.New("preference owner is required")
	}
	record, err := app.FindFirstRecordByFilter(
		CollectionName,
		"owner = {:owner}",
		dbx.Params{"owner": ownerID},
	)
	if err != nil {
		return Preferences{}, err
	}
	return fromRecord(record), nil
}

func Ensure(app core.App, ownerID string) (Preferences, error) {
	preference, err := Get(app, ownerID)
	if err == nil {
		return preference, nil
	}
	collection, collectionErr := app.FindCollectionByNameOrId(CollectionName)
	if collectionErr != nil {
		return Preferences{}, collectionErr
	}
	record := core.NewRecord(collection)
	record.Set("owner", ownerID)
	record.Set("theme", "system")
	record.Set("memory_enabled", false)
	record.Set("memory_auto_capture", false)
	if saveErr := app.Save(record); saveErr != nil {
		// A concurrent ensure may have won the unique-owner race.
		if existing, findErr := Get(app, ownerID); findErr == nil {
			return existing, nil
		}
		return Preferences{}, saveErr
	}
	return fromRecord(record), nil
}

func fromRecord(record *core.Record) Preferences {
	theme := record.GetString("theme")
	if theme == "" {
		theme = "system"
	}
	return Preferences{
		ID:                record.Id,
		Owner:             record.GetString("owner"),
		Theme:             theme,
		MemoryEnabled:     record.GetBool("memory_enabled"),
		MemoryAutoCapture: record.GetBool("memory_auto_capture"),
		Created:           record.GetDateTime("created").String(),
		Updated:           record.GetDateTime("updated").String(),
	}
}
