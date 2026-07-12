package tools

import (
	"context"
	"encoding/json"

	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"
	workcalendar "github.com/xusenlin/workavera/internal/calendar"
)

type calendarGetScheduleInput struct {
	Dates []string `json:"dates" description:"One or more calendar dates in YYYY-MM-DD format; maximum 31 unique dates"`
}

type calendarCreateEventInput struct {
	Title                 string `json:"title" description:"Event title"`
	Description           string `json:"description,omitempty" description:"Optional event description"`
	StartAt               string `json:"startAt" description:"Start date-time in RFC 3339 format with an explicit UTC offset"`
	EndAt                 string `json:"endAt" description:"End date-time in RFC 3339 format with an explicit UTC offset; must be after startAt"`
	AllDay                bool   `json:"allDay,omitempty" description:"Whether this is an all-day event; defaults to false"`
	Timezone              string `json:"timezone" description:"IANA timezone such as Asia/Shanghai or America/New_York"`
	Location              string `json:"location,omitempty" description:"Optional physical location or meeting link"`
	Color                 string `json:"color,omitempty" description:"Optional color: blue, green, amber, red, or purple; defaults to blue"`
	RecurrenceFrequency   string `json:"recurrenceFrequency,omitempty" description:"Repeat frequency: none, daily, weekly, monthly, or yearly; defaults to none"`
	RecurrenceInterval    int    `json:"recurrenceInterval,omitempty" description:"Positive whole-number repeat interval; defaults to 1"`
	ReminderMinutesBefore *int   `json:"reminderMinutesBefore,omitempty" description:"Reminder lead time: -1 for none, or 0, 5, 10, 30, 60, 1440 minutes; defaults to -1"`
}

type calendarUpdateEventInput struct {
	EventID               string  `json:"eventId" description:"Existing personal event ID returned by calendar_get_schedule or calendar_create_event"`
	Title                 *string `json:"title,omitempty" description:"Optional replacement event title"`
	Description           *string `json:"description,omitempty" description:"Optional replacement description; pass an empty string to clear"`
	StartAt               *string `json:"startAt,omitempty" description:"Optional replacement start date-time in RFC 3339 format with an explicit UTC offset"`
	EndAt                 *string `json:"endAt,omitempty" description:"Optional replacement end date-time in RFC 3339 format with an explicit UTC offset"`
	AllDay                *bool   `json:"allDay,omitempty" description:"Optional replacement all-day setting"`
	Timezone              *string `json:"timezone,omitempty" description:"Optional replacement IANA timezone"`
	Location              *string `json:"location,omitempty" description:"Optional replacement location; pass an empty string to clear"`
	Color                 *string `json:"color,omitempty" description:"Optional replacement color: blue, green, amber, red, or purple"`
	RecurrenceFrequency   *string `json:"recurrenceFrequency,omitempty" description:"Optional replacement repeat frequency: none, daily, weekly, monthly, or yearly"`
	RecurrenceInterval    *int    `json:"recurrenceInterval,omitempty" description:"Optional positive whole-number repeat interval"`
	ReminderMinutesBefore *int    `json:"reminderMinutesBefore,omitempty" description:"Optional reminder lead time: -1, 0, 5, 10, 30, 60, or 1440 minutes"`
}

func newCalendarGetScheduleTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"calendar_get_schedule",
		"Get all personal Calendar events and visible Board task deadlines for one or more exact dates. Repeating events are expanded for the requested dates. Use returned event IDs before editing an event.",
		func(ctx context.Context, input calendarGetScheduleInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := workcalendar.GetSchedule(ctx, app, actorID, input.Dates)
			return calendarToolResult(app, actorID, "get schedule", result, err)
		},
	)
}

func newCalendarCreateEventTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"calendar_create_event",
		"Create a personal Calendar event owned by the current user. This creates only calendar_events, never Board tasks. Obtain explicit date, time, and timezone details from the user before calling it.",
		func(ctx context.Context, input calendarCreateEventInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := workcalendar.CreateEvent(ctx, app, actorID, workcalendar.CreateEventCommand{
				Title: input.Title, Description: input.Description, StartAt: input.StartAt, EndAt: input.EndAt,
				AllDay: input.AllDay, Timezone: input.Timezone, Location: input.Location, Color: input.Color,
				RecurrenceFrequency: input.RecurrenceFrequency, RecurrenceInterval: input.RecurrenceInterval,
				ReminderMinutesBefore: input.ReminderMinutesBefore,
			})
			return calendarToolResult(app, actorID, "create event", result, err)
		},
	)
}

func newCalendarUpdateEventTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"calendar_update_event",
		"Patch an existing personal Calendar event. Call calendar_get_schedule first and use an event ID it returned. Omitted fields remain unchanged; editing a repeating event updates the entire series. This tool cannot edit Board tasks.",
		func(ctx context.Context, input calendarUpdateEventInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := workcalendar.UpdateEvent(ctx, app, actorID, workcalendar.UpdateEventCommand{
				EventID: input.EventID, Title: input.Title, Description: input.Description, StartAt: input.StartAt,
				EndAt: input.EndAt, AllDay: input.AllDay, Timezone: input.Timezone, Location: input.Location,
				Color: input.Color, RecurrenceFrequency: input.RecurrenceFrequency,
				RecurrenceInterval: input.RecurrenceInterval, ReminderMinutesBefore: input.ReminderMinutesBefore,
			})
			return calendarToolResult(app, actorID, "update event", result, err)
		},
	)
}

func calendarToolResult(app core.App, actorID, action string, value any, err error) (fantasy.ToolResponse, error) {
	if err != nil {
		app.Logger().Warn("assistant calendar tool failed", "actorId", actorID, "action", action, "error", err)
		return fantasy.NewTextErrorResponse(err.Error()), nil
	}
	data, err := json.Marshal(value)
	if err != nil {
		return fantasy.NewTextErrorResponse("Failed to serialize Calendar result"), nil
	}
	return fantasy.NewTextResponse(string(data)), nil
}
