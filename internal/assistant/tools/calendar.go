package tools

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"
	workcalendar "github.com/xusenlin/workavera/internal/calendar"
	"github.com/xusenlin/workavera/internal/configs"
)

type calendarGetScheduleInput struct {
	Dates []string `json:"dates" description:"One or more calendar dates in YYYY-MM-DD format; maximum 31 unique dates"`
}

type calendarCreateEventInput struct {
	Title                 string `json:"title" description:"Event title"`
	Description           string `json:"description,omitempty" description:"Optional event description"`
	StartAt               string `json:"startAt" description:"Start local date-time in the configured system timezone, formatted as YYYY-MM-DDTHH:MM:SS"`
	EndAt                 string `json:"endAt" description:"End local date-time in the configured system timezone, formatted as YYYY-MM-DDTHH:MM:SS; must be after startAt"`
	AllDay                bool   `json:"allDay,omitempty" description:"Whether this is an all-day event; defaults to false"`
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
	StartAt               *string `json:"startAt,omitempty" description:"Optional replacement start local date-time in the configured system timezone, formatted as YYYY-MM-DDTHH:MM:SS"`
	EndAt                 *string `json:"endAt,omitempty" description:"Optional replacement end local date-time in the configured system timezone, formatted as YYYY-MM-DDTHH:MM:SS"`
	AllDay                *bool   `json:"allDay,omitempty" description:"Optional replacement all-day setting"`
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
		"Create a personal Calendar event owned by the current user only when explicitly requested. This creates only calendar_events, never Board tasks. Obtain explicit date and time details from the user before calling it. All date-times use the administrator-configured system timezone.",
		func(ctx context.Context, input calendarCreateEventInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			location := configs.SystemLocation(app)
			startAt, err := calendarLocalDateTime(input.StartAt, location)
			if err != nil {
				return calendarToolResult(app, actorID, "create event", nil, fmt.Errorf("invalid startAt: %w", err))
			}
			endAt, err := calendarLocalDateTime(input.EndAt, location)
			if err != nil {
				return calendarToolResult(app, actorID, "create event", nil, fmt.Errorf("invalid endAt: %w", err))
			}
			result, err := workcalendar.CreateEvent(ctx, app, actorID, workcalendar.CreateEventCommand{
				Title: input.Title, Description: input.Description, StartAt: startAt, EndAt: endAt,
				AllDay: input.AllDay, Location: input.Location, Color: input.Color,
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
		"Patch an existing personal Calendar event only when explicitly requested. Call calendar_get_schedule first and use an event ID it returned. Omitted fields remain unchanged; editing a repeating event updates the entire series. All date-times use the administrator-configured system timezone. This tool cannot edit Board tasks.",
		func(ctx context.Context, input calendarUpdateEventInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			location := configs.SystemLocation(app)
			startAt, err := optionalCalendarLocalDateTime(input.StartAt, location)
			if err != nil {
				return calendarToolResult(app, actorID, "update event", nil, fmt.Errorf("invalid startAt: %w", err))
			}
			endAt, err := optionalCalendarLocalDateTime(input.EndAt, location)
			if err != nil {
				return calendarToolResult(app, actorID, "update event", nil, fmt.Errorf("invalid endAt: %w", err))
			}
			result, err := workcalendar.UpdateEvent(ctx, app, actorID, workcalendar.UpdateEventCommand{
				EventID: input.EventID, Title: input.Title, Description: input.Description, StartAt: startAt,
				EndAt: endAt, AllDay: input.AllDay, Location: input.Location,
				Color: input.Color, RecurrenceFrequency: input.RecurrenceFrequency,
				RecurrenceInterval: input.RecurrenceInterval, ReminderMinutesBefore: input.ReminderMinutesBefore,
			})
			return calendarToolResult(app, actorID, "update event", result, err)
		},
	)
}

const calendarLocalDateTimeLayout = "2006-01-02T15:04:05"

func calendarLocalDateTime(value string, location *time.Location) (string, error) {
	parsed, err := time.ParseInLocation(calendarLocalDateTimeLayout, value, location)
	if err != nil {
		return "", errors.New("must use YYYY-MM-DDTHH:MM:SS format")
	}
	if parsed.Format(calendarLocalDateTimeLayout) != value {
		return "", errors.New("does not exist in the configured system timezone")
	}
	return parsed.Format(time.RFC3339), nil
}

func optionalCalendarLocalDateTime(value *string, location *time.Location) (*string, error) {
	if value == nil {
		return nil, nil
	}
	parsed, err := calendarLocalDateTime(*value, location)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
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
