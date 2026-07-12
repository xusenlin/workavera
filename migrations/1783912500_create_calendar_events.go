package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const calendarEventsCollection = "calendar_events"

func init() {
	m.Register(createCalendarEventsCollection, dropCalendarEventsCollection)
}

func createCalendarEventsCollection(app core.App) error {
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}

	events := core.NewBaseCollection(calendarEventsCollection)
	events.ListRule = types.Pointer(`@request.auth.id != "" && owner = @request.auth.id`)
	events.ViewRule = events.ListRule
	events.CreateRule = types.Pointer(`@request.auth.id != "" && @request.body.owner = @request.auth.id`)
	events.UpdateRule = types.Pointer(`owner = @request.auth.id && @request.body.owner:changed = false`)
	events.DeleteRule = types.Pointer(`owner = @request.auth.id`)
	events.Fields.Add(
		&core.RelationField{Name: "owner", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.TextField{Name: "title", Required: true, Max: 240, Presentable: true},
		&core.TextField{Name: "description", Max: 10000},
		&core.DateField{Name: "start_at", Required: true},
		&core.DateField{Name: "end_at", Required: true},
		&core.BoolField{Name: "all_day"},
		&core.TextField{Name: "timezone", Required: true, Max: 100},
		&core.TextField{Name: "location", Max: 500},
		&core.SelectField{Name: "color", Required: true, MaxSelect: 1, Values: []string{"blue", "green", "amber", "red", "purple"}},
		&core.SelectField{Name: "recurrence_frequency", Required: true, MaxSelect: 1, Values: []string{"none", "daily", "weekly", "monthly", "yearly"}},
		&core.NumberField{Name: "recurrence_interval", Required: true, Min: types.Pointer(1.0)},
		&core.NumberField{Name: "reminder_minutes_before", Required: true, Min: types.Pointer(-1.0)},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	events.AddIndex("idx_calendar_events_owner_start", false, "owner, start_at", "")
	return app.Save(events)
}

func dropCalendarEventsCollection(app core.App) error {
	events, err := app.FindCollectionByNameOrId(calendarEventsCollection)
	if err != nil {
		return err
	}
	return app.Delete(events)
}
