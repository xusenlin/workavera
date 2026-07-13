package notifications

import (
	"context"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	_ "github.com/xusenlin/workavera/migrations"
)

func TestTaskSchedulerSkipsCompletedAndDeduplicates(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	owner := createSchedulerUser(t, app, "scheduler-owner@example.com")
	assignee := createSchedulerUser(t, app, "scheduler-assignee@example.com")
	project := createSchedulerRecord(t, app, "board_projects", map[string]any{"name": "Launch", "owner": owner.Id})
	pending := createSchedulerRecord(t, app, "board_project_states", map[string]any{"project": project.Id, "name": "Doing", "color": "#000000", "category": "active", "sort_order": 1})
	completed := createSchedulerRecord(t, app, "board_project_states", map[string]any{"project": project.Id, "name": "Done", "color": "#00ff00", "category": "completed", "sort_order": 2})
	createSchedulerRecord(t, app, "board_tasks", map[string]any{"project": project.Id, "state": pending.Id, "title": "Ship it", "priority": "high", "due_date": "2026-07-12", "assignees": []string{assignee.Id}, "created_by": owner.Id})
	createSchedulerRecord(t, app, "board_tasks", map[string]any{"project": project.Id, "state": completed.Id, "title": "Already done", "priority": "low", "due_date": "2026-07-12", "assignees": []string{assignee.Id}, "created_by": owner.Id})

	location, _ := time.LoadLocation("Asia/Shanghai")
	if err := RunDue(context.Background(), app, time.Date(2026, 7, 12, 8, 59, 0, 0, location)); err != nil {
		t.Fatal(err)
	}
	if count, _ := app.CountRecords(CollectionName); count != 0 {
		t.Fatalf("expected no task reminders before 09:00, got %d", count)
	}
	for range 2 {
		if err := RunDue(context.Background(), app, time.Date(2026, 7, 12, 9, 1, 0, 0, location)); err != nil {
			t.Fatal(err)
		}
	}
	records, err := app.FindRecordsByFilter(CollectionName, "recipient = {:recipient}", "", 0, 0, dbx.Params{"recipient": assignee.Id})
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 1 || records[0].GetString("title") != "Task due today: Ship it" {
		t.Fatalf("expected only the unfinished task reminder, got %#v", records)
	}
}

func TestCalendarSchedulerUsesConfiguredTimezone(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	owner := createSchedulerUser(t, app, "calendar-reminder@example.com")
	createSchedulerRecord(t, app, "calendar_events", map[string]any{
		"owner": owner.Id, "title": "Review", "start_at": "2026-07-12 02:05:00.000Z", "end_at": "2026-07-12 03:05:00.000Z", "timezone": "UTC", "color": "blue", "recurrence_frequency": "none", "recurrence_interval": 1, "reminder_minutes_before": 10,
	})
	location, _ := time.LoadLocation("Asia/Shanghai")
	if err := RunDue(context.Background(), app, time.Date(2026, 7, 12, 10, 0, 0, 0, location)); err != nil {
		t.Fatal(err)
	}
	records, err := app.FindRecordsByFilter(CollectionName, "recipient = {:recipient} && type = 'calendar_event'", "", 0, 0, dbx.Params{"recipient": owner.Id})
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 1 || records[0].GetString("body") != "Starts Jul 12 at 10:05." {
		t.Fatalf("expected one configured-timezone reminder, got %#v", records)
	}
}

func TestCalendarSchedulerKeepsRecurringEventsOutsideOneOffWindow(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	owner := createSchedulerUser(t, app, "recurring-reminder@example.com")
	createSchedulerRecord(t, app, "calendar_events", map[string]any{
		"owner": owner.Id, "title": "Weekly review", "start_at": "2026-07-05 02:05:00.000Z", "end_at": "2026-07-05 03:05:00.000Z", "timezone": "UTC", "color": "blue", "recurrence_frequency": "weekly", "recurrence_interval": 1, "reminder_minutes_before": 10,
	})
	location, _ := time.LoadLocation("Asia/Shanghai")
	if err := RunDue(context.Background(), app, time.Date(2026, 7, 12, 10, 0, 0, 0, location)); err != nil {
		t.Fatal(err)
	}
	records, err := app.FindRecordsByFilter(CollectionName, "recipient = {:recipient} && type = 'calendar_event'", "", 0, 0, dbx.Params{"recipient": owner.Id})
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 1 || records[0].GetString("title") != "Event reminder: Weekly review" {
		t.Fatalf("expected recurring reminder, got %#v", records)
	}
}

func createSchedulerUser(t *testing.T, app core.App, email string) *core.Record {
	t.Helper()
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(users)
	record.SetEmail(email)
	record.SetPassword("password123")
	record.Set("name", email)
	record.SetVerified(true)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func createSchedulerRecord(t *testing.T, app core.App, collectionName string, values map[string]any) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	for key, value := range values {
		record.Set(key, value)
	}
	if err := app.Save(record); err != nil {
		t.Fatalf("save %s: %v", collectionName, err)
	}
	return record
}
