package notifications

import (
	"context"
	"fmt"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	calendarfeature "github.com/xusenlin/workavera/internal/calendar"
	"github.com/xusenlin/workavera/internal/configs"
)

const schedulerJobID = "workavera_notifications"

func registerScheduler(app core.App) {
	if err := app.Cron().Add(schedulerJobID, "*/6 * * * *", func() {
		if err := RunDue(context.Background(), app, time.Now()); err != nil {
			app.Logger().Error("notification scheduler failed", "error", err)
		}
	}); err != nil {
		app.Logger().Error("could not register notification scheduler", "error", err)
	}
}

func RunDue(ctx context.Context, app core.App, now time.Time) error {
	location := configs.SystemLocation(app)
	now = now.In(location)
	if err := createTaskNotifications(ctx, app, now); err != nil {
		return err
	}
	return createCalendarNotifications(ctx, app, now, location)
}

func createTaskNotifications(ctx context.Context, app core.App, now time.Time) error {
	if now.Hour() < 9 {
		return nil
	}
	date := now.Format(time.DateOnly)
	start := date + " 00:00:00.000Z"
	end := now.AddDate(0, 0, 1).Format(time.DateOnly) + " 00:00:00.000Z"
	tasks, err := app.FindRecordsByFilter("board_tasks", "due_date >= {:start} && due_date < {:end}", "", 0, 0, dbx.Params{"start": start, "end": end})
	if err != nil {
		return err
	}
	statesByID := make(map[string]*core.Record)
	projectsByID := make(map[string]*core.Record)
	for _, task := range tasks {
		if err := ctx.Err(); err != nil {
			return err
		}
		stateID := task.GetString("state")
		state, found := statesByID[stateID]
		if !found {
			state, err = app.FindRecordById("board_project_states", stateID)
			if err != nil {
				continue
			}
			statesByID[stateID] = state
		}
		if state.GetString("category") == "completed" {
			continue
		}
		projectID := task.GetString("project")
		project, found := projectsByID[projectID]
		if !found {
			project, err = app.FindRecordById("board_projects", projectID)
			if err != nil {
				continue
			}
			projectsByID[projectID] = project
		}
		recipients := task.GetStringSlice("assignees")
		if len(recipients) == 0 {
			recipients = []string{project.GetString("owner")}
		}
		for _, recipient := range recipients {
			if recipient == "" {
				continue
			}
			_, _, err := Create(ctx, app, CreateInput{
				RecipientID: recipient,
				Type:        "task_due",
				Title:       "Task due today: " + task.GetString("title"),
				Body:        fmt.Sprintf("The task in %s is due today.", project.GetString("name")),
				Data: map[string]any{
					"taskId": task.Id, "projectId": project.Id, "dueDate": date,
				},
				DedupeKey: fmt.Sprintf("task:%s:%s:%s", task.Id, date, recipient),
			})
			if err != nil {
				return err
			}
		}
	}
	return nil
}

func createCalendarNotifications(ctx context.Context, app core.App, now time.Time, location *time.Location) error {
	oldest := now.Add(-24 * time.Hour)
	latest := now.Add(24 * time.Hour)
	events, err := app.FindRecordsByFilter(
		"calendar_events",
		"reminder_minutes_before >= 0 && (recurrence_frequency != 'none' || (start_at >= {:oldest} && start_at <= {:latest}))",
		"",
		0,
		0,
		dbx.Params{"oldest": oldest.UTC(), "latest": latest.UTC()},
	)
	if err != nil {
		return err
	}
	for _, event := range events {
		if err := ctx.Err(); err != nil {
			return err
		}
		for offset := -1; offset <= 1; offset++ {
			date := now.AddDate(0, 0, offset)
			occurrence, ok := calendarfeature.OccurrenceOnDate(event, date, location)
			if !ok {
				continue
			}
			start, err := time.Parse(time.RFC3339, occurrence.InstanceStart)
			if err != nil {
				continue
			}
			scheduledAt := start.Add(-time.Duration(event.GetInt("reminder_minutes_before")) * time.Minute)
			if scheduledAt.After(now) || scheduledAt.Before(oldest) {
				continue
			}
			recipient := event.GetString("owner")
			_, _, err = Create(ctx, app, CreateInput{
				RecipientID: recipient,
				Type:        "calendar_event",
				Title:       "Event reminder: " + event.GetString("title"),
				Body:        calendarReminderBody(start.In(location), event.GetString("location")),
				Data: map[string]any{
					"eventId": event.Id, "occurrenceDate": occurrence.OccurrenceDate, "instanceStart": occurrence.InstanceStart,
				},
				DedupeKey: fmt.Sprintf("event:%s:%s:%s", event.Id, occurrence.InstanceStart, recipient),
			})
			if err != nil {
				return err
			}
		}
	}
	return nil
}

func calendarReminderBody(start time.Time, location string) string {
	body := "Starts " + start.Format("Jan 2 at 15:04")
	if location != "" {
		body += " at " + location
	}
	return body + "."
}
