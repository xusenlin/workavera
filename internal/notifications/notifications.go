package notifications

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

const CollectionName = "notifications"

type CreateInput struct {
	RecipientID string
	Type        string
	Title       string
	Body        string
	Data        map[string]any
	DedupeKey   string
}

func Register(app core.App) {
	app.OnServe().BindFunc(func(event *core.ServeEvent) error {
		group := event.Router.Group("/api/notifications").Bind(apis.RequireAuth("users"))
		group.POST("/{id}/read", markRead)
		group.POST("/read-all", markAllRead)
		return event.Next()
	})
	registerScheduler(app)
}

func Create(ctx context.Context, app core.App, input CreateInput) (*core.Record, bool, error) {
	if err := ctx.Err(); err != nil {
		return nil, false, err
	}
	input.Title = strings.TrimSpace(input.Title)
	if input.RecipientID == "" || input.Type == "" || input.Title == "" || input.DedupeKey == "" {
		return nil, false, errors.New("invalid notification input")
	}
	existing, err := app.FindRecordsByFilter(CollectionName, "dedupe_key = {:key}", "", 1, 0, dbx.Params{"key": input.DedupeKey})
	if err != nil {
		return nil, false, err
	}
	if len(existing) > 0 {
		return existing[0], false, nil
	}
	collection, err := app.FindCollectionByNameOrId(CollectionName)
	if err != nil {
		return nil, false, err
	}
	record := core.NewRecord(collection)
	record.Set("recipient", input.RecipientID)
	record.Set("type", input.Type)
	record.Set("title", input.Title)
	record.Set("body", strings.TrimSpace(input.Body))
	record.Set("data", input.Data)
	record.Set("dedupe_key", input.DedupeKey)
	if err := app.Save(record); err != nil {
		// A concurrent scheduler may have inserted the same unique key.
		existing, findErr := app.FindRecordsByFilter(CollectionName, "dedupe_key = {:key}", "", 1, 0, dbx.Params{"key": input.DedupeKey})
		if findErr == nil && len(existing) > 0 {
			return existing[0], false, nil
		}
		return nil, false, err
	}
	return record, true, nil
}

func Update(ctx context.Context, app core.App, dedupeKey string, input CreateInput) (*core.Record, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	record, err := app.FindFirstRecordByFilter(CollectionName, "dedupe_key = {:key}", dbx.Params{"key": dedupeKey})
	if err != nil {
		return nil, err
	}
	record.Set("title", strings.TrimSpace(input.Title))
	record.Set("body", strings.TrimSpace(input.Body))
	record.Set("data", input.Data)
	record.Set("read_at", "")
	if err := app.Save(record); err != nil {
		return nil, err
	}
	return record, nil
}

func markRead(event *core.RequestEvent) error {
	record, err := event.App.FindFirstRecordByFilter(CollectionName, "id = {:id} && recipient = {:recipient}", dbx.Params{"id": event.Request.PathValue("id"), "recipient": event.Auth.Id})
	if err != nil {
		return event.NotFoundError("Notification not found.", err)
	}
	if record.GetString("read_at") == "" {
		record.Set("read_at", types.NowDateTime())
		if err := event.App.Save(record); err != nil {
			return event.BadRequestError("Could not mark notification as read.", err)
		}
	}
	return event.JSON(http.StatusOK, map[string]bool{"ok": true})
}

func markAllRead(event *core.RequestEvent) error {
	records, err := event.App.FindRecordsByFilter(CollectionName, "recipient = {:recipient} && read_at = ''", "", 0, 0, dbx.Params{"recipient": event.Auth.Id})
	if err != nil {
		return event.InternalServerError("Could not load notifications.", err)
	}
	for _, record := range records {
		record.Set("read_at", types.NowDateTime())
		if err := event.App.Save(record); err != nil {
			return event.InternalServerError("Could not mark notifications as read.", err)
		}
	}
	return event.JSON(http.StatusOK, map[string]int{"updated": len(records)})
}
