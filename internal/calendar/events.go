package calendar

import (
	"context"
	"errors"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"github.com/xusenlin/workavera/internal/configs"
)

type Event struct {
	ID                    string `json:"id"`
	Title                 string `json:"title"`
	Description           string `json:"description,omitempty"`
	StartAt               string `json:"startAt"`
	EndAt                 string `json:"endAt"`
	AllDay                bool   `json:"allDay"`
	Timezone              string `json:"timezone"`
	Location              string `json:"location,omitempty"`
	Color                 string `json:"color"`
	RecurrenceFrequency   string `json:"recurrenceFrequency"`
	RecurrenceInterval    int    `json:"recurrenceInterval"`
	ReminderMinutesBefore int    `json:"reminderMinutesBefore"`
}

type CreateEventCommand struct {
	Title                 string
	Description           string
	StartAt               string
	EndAt                 string
	AllDay                bool
	Timezone              string
	Location              string
	Color                 string
	RecurrenceFrequency   string
	RecurrenceInterval    int
	ReminderMinutesBefore *int
}

type UpdateEventCommand struct {
	EventID               string
	Title                 *string
	Description           *string
	StartAt               *string
	EndAt                 *string
	AllDay                *bool
	Timezone              *string
	Location              *string
	Color                 *string
	RecurrenceFrequency   *string
	RecurrenceInterval    *int
	ReminderMinutesBefore *int
}

type EventMutationResult struct {
	OK     bool   `json:"ok"`
	Action string `json:"action"`
	Event  Event  `json:"event"`
}

func CreateEvent(ctx context.Context, app core.App, actorID string, command CreateEventCommand) (EventMutationResult, error) {
	if err := requireActiveActor(ctx, app, actorID); err != nil {
		return EventMutationResult{}, err
	}
	collection, err := app.FindCollectionByNameOrId(eventsCollection)
	if err != nil {
		return EventMutationResult{}, err
	}

	if strings.TrimSpace(command.Color) == "" {
		command.Color = "blue"
	}
	if strings.TrimSpace(command.RecurrenceFrequency) == "" {
		command.RecurrenceFrequency = "none"
	}
	if command.RecurrenceInterval == 0 {
		command.RecurrenceInterval = 1
	}
	command.Timezone = configs.SystemLocation(app).String()
	reminder := -1
	if command.ReminderMinutesBefore != nil {
		reminder = *command.ReminderMinutesBefore
	}

	record := core.NewRecord(collection)
	record.Set("owner", actorID)
	record.Set("title", strings.TrimSpace(command.Title))
	record.Set("description", strings.TrimSpace(command.Description))
	record.Set("start_at", strings.TrimSpace(command.StartAt))
	record.Set("end_at", strings.TrimSpace(command.EndAt))
	record.Set("all_day", command.AllDay)
	record.Set("timezone", strings.TrimSpace(command.Timezone))
	record.Set("location", strings.TrimSpace(command.Location))
	record.Set("color", strings.TrimSpace(command.Color))
	record.Set("recurrence_frequency", strings.TrimSpace(command.RecurrenceFrequency))
	record.Set("recurrence_interval", command.RecurrenceInterval)
	record.Set("reminder_minutes_before", reminder)
	if err := validateEventRecord(record); err != nil {
		return EventMutationResult{}, err
	}
	if err := app.Save(record); err != nil {
		return EventMutationResult{}, err
	}
	return EventMutationResult{OK: true, Action: "created", Event: eventFromRecord(record)}, nil
}

func UpdateEvent(ctx context.Context, app core.App, actorID string, command UpdateEventCommand) (EventMutationResult, error) {
	if err := requireActiveActor(ctx, app, actorID); err != nil {
		return EventMutationResult{}, err
	}
	record, err := app.FindRecordById(eventsCollection, strings.TrimSpace(command.EventID))
	if err != nil || record.GetString("owner") != actorID {
		return EventMutationResult{}, errors.New("calendar event not found")
	}
	record.Set("timezone", configs.SystemLocation(app).String())

	if command.Title != nil {
		record.Set("title", strings.TrimSpace(*command.Title))
	}
	if command.Description != nil {
		record.Set("description", strings.TrimSpace(*command.Description))
	}
	if command.StartAt != nil {
		record.Set("start_at", strings.TrimSpace(*command.StartAt))
	}
	if command.EndAt != nil {
		record.Set("end_at", strings.TrimSpace(*command.EndAt))
	}
	if command.AllDay != nil {
		record.Set("all_day", *command.AllDay)
	}
	if command.Location != nil {
		record.Set("location", strings.TrimSpace(*command.Location))
	}
	if command.Color != nil {
		record.Set("color", strings.TrimSpace(*command.Color))
	}
	if command.RecurrenceFrequency != nil {
		record.Set("recurrence_frequency", strings.TrimSpace(*command.RecurrenceFrequency))
	}
	if command.RecurrenceInterval != nil {
		record.Set("recurrence_interval", *command.RecurrenceInterval)
	}
	if command.ReminderMinutesBefore != nil {
		record.Set("reminder_minutes_before", *command.ReminderMinutesBefore)
	}
	if err := validateEventRecord(record); err != nil {
		return EventMutationResult{}, err
	}
	if err := app.Save(record); err != nil {
		return EventMutationResult{}, err
	}
	return EventMutationResult{OK: true, Action: "updated", Event: eventFromRecord(record)}, nil
}

func validateEventRecord(record *core.Record) error {
	return validateEventValues(
		record.GetString("title"),
		record.GetDateTime("start_at").Time(),
		record.GetDateTime("end_at").Time(),
		record.GetString("timezone"),
		record.GetString("color"),
		record.GetString("recurrence_frequency"),
		record.GetFloat("recurrence_interval"),
		record.GetFloat("reminder_minutes_before"),
	)
}

func eventFromRecord(record *core.Record) Event {
	return Event{
		ID:                    record.Id,
		Title:                 record.GetString("title"),
		Description:           record.GetString("description"),
		StartAt:               record.GetDateTime("start_at").String(),
		EndAt:                 record.GetDateTime("end_at").String(),
		AllDay:                record.GetBool("all_day"),
		Timezone:              record.GetString("timezone"),
		Location:              record.GetString("location"),
		Color:                 record.GetString("color"),
		RecurrenceFrequency:   record.GetString("recurrence_frequency"),
		RecurrenceInterval:    record.GetInt("recurrence_interval"),
		ReminderMinutesBefore: record.GetInt("reminder_minutes_before"),
	}
}

func requireActiveActor(ctx context.Context, app core.App, actorID string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if strings.TrimSpace(actorID) == "" {
		return errors.New("missing actor")
	}
	if _, err := app.FindRecordById("users", actorID); err != nil {
		return errors.New("actor is not an active user")
	}
	return nil
}
