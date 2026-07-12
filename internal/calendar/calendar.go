package calendar

import (
	"errors"
	"math"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"github.com/xusenlin/workavera/internal/configs"
)

const eventsCollection = "calendar_events"

var allowedReminderMinutes = map[int]bool{
	-1:   true,
	0:    true,
	5:    true,
	10:   true,
	30:   true,
	60:   true,
	1440: true,
}

var allowedColors = map[string]bool{
	"blue": true, "green": true, "amber": true, "red": true, "purple": true,
}

var allowedRecurrenceFrequencies = map[string]bool{
	"none": true, "daily": true, "weekly": true, "monthly": true, "yearly": true,
}

// Register attaches Calendar record validation to the application.
func Register(app core.App) {
	app.OnRecordCreateRequest(eventsCollection).BindFunc(validateEventRequest)
	app.OnRecordUpdateRequest(eventsCollection).BindFunc(validateEventRequest)
}

func validateEventRequest(event *core.RecordRequestEvent) error {
	timezone := configs.SystemLocation(event.App).String()
	event.Record.Set("timezone", timezone)
	title := strings.TrimSpace(event.Record.GetString("title"))
	start := event.Record.GetDateTime("start_at")
	end := event.Record.GetDateTime("end_at")
	interval := event.Record.GetFloat("recurrence_interval")
	reminder := event.Record.GetFloat("reminder_minutes_before")

	if err := validateEventValues(title, start.Time(), end.Time(), timezone, event.Record.GetString("color"), event.Record.GetString("recurrence_frequency"), interval, reminder); err != nil {
		return event.BadRequestError(err.Error(), err)
	}
	if event.Record.IsNew() && event.Auth != nil && event.Record.GetString("owner") != event.Auth.Id {
		return event.ForbiddenError("You can only create calendar events for yourself.", nil)
	}

	event.Record.Set("title", title)
	return event.Next()
}

func validateEventValues(title string, start, end time.Time, timezone, color, frequency string, interval, reminder float64) error {
	if strings.TrimSpace(title) == "" {
		return errors.New("event title is required")
	}
	if start.IsZero() || end.IsZero() || !end.After(start) {
		return errors.New("event end time must be after its start time")
	}
	if _, err := time.LoadLocation(strings.TrimSpace(timezone)); err != nil {
		return errors.New("event timezone must be a valid IANA timezone")
	}
	if !allowedColors[color] {
		return errors.New("unsupported event color")
	}
	if !allowedRecurrenceFrequencies[frequency] {
		return errors.New("unsupported recurrence frequency")
	}
	if interval < 1 || interval != math.Trunc(interval) {
		return errors.New("recurrence interval must be a positive whole number")
	}
	if reminder != math.Trunc(reminder) || !allowedReminderMinutes[int(reminder)] {
		return errors.New("unsupported reminder interval")
	}
	return nil
}
