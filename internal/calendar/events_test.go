package calendar

import (
	"context"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	_ "github.com/xusenlin/workavera/migrations"
)

func TestGetScheduleExpandsOwnedEventsAndFiltersVisibleTasks(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	actor := createCalendarTestUser(t, app, "calendar-actor@example.com")
	other := createCalendarTestUser(t, app, "calendar-other@example.com")

	reminder := 10
	created, err := CreateEvent(context.Background(), app, actor.Id, CreateEventCommand{
		Title: "Weekly planning", StartAt: "2026-07-13T09:00:00+08:00", EndAt: "2026-07-13T10:00:00+08:00",
		RecurrenceFrequency: "weekly", RecurrenceInterval: 1, ReminderMinutesBefore: &reminder,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !created.OK || created.Event.ID == "" || created.Event.Color != "blue" {
		t.Fatalf("unexpected create result: %#v", created)
	}
	if _, err := CreateEvent(context.Background(), app, other.Id, CreateEventCommand{
		Title: "Private", StartAt: "2026-07-20T12:00:00+08:00", EndAt: "2026-07-20T13:00:00+08:00",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := CreateEvent(context.Background(), app, actor.Id, CreateEventCommand{
		Title: "One-off review", StartAt: "2026-07-20T14:00:00+08:00", EndAt: "2026-07-20T15:00:00+08:00",
	}); err != nil {
		t.Fatal(err)
	}

	visibleProject := createCalendarTestProject(t, app, actor.Id, "Visible")
	visibleState := createCalendarTestState(t, app, visibleProject.Id, "Todo", "pending")
	createCalendarTestTask(t, app, visibleProject.Id, visibleState.Id, actor.Id, "Visible task", "2026-07-20")
	sharedProject := createCalendarTestProject(t, app, other.Id, "Shared")
	sharedState := createCalendarTestState(t, app, sharedProject.Id, "Doing", "active")
	createCalendarTestMembership(t, app, sharedProject.Id, actor.Id)
	createCalendarTestTask(t, app, sharedProject.Id, sharedState.Id, other.Id, "Shared task", "2026-07-20")
	hiddenProject := createCalendarTestProject(t, app, other.Id, "Hidden")
	hiddenState := createCalendarTestState(t, app, hiddenProject.Id, "Done", "completed")
	createCalendarTestTask(t, app, hiddenProject.Id, hiddenState.Id, other.Id, "Hidden task", "2026-07-20")

	result, err := GetSchedule(context.Background(), app, actor.Id, []string{"2026-07-20", "2026-07-13", "2026-07-20"})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Days) != 2 || result.Days[0].Date != "2026-07-13" || result.Days[1].Date != "2026-07-20" {
		t.Fatalf("unexpected days: %#v", result.Days)
	}
	if len(result.Days[0].Events) != 1 || len(result.Days[1].Events) != 2 {
		t.Fatalf("weekly event was not expanded: %#v", result.Days)
	}
	if result.Days[1].Events[0].ID != created.Event.ID || result.Days[1].Events[0].InstanceStart != "2026-07-20T09:00:00+08:00" {
		t.Fatalf("unexpected occurrence: %#v", result.Days[1].Events[0])
	}
	if len(result.Days[1].Tasks) != 2 || result.Days[1].Tasks[0].Title != "Shared task" || result.Days[1].Tasks[1].Title != "Visible task" {
		t.Fatalf("task visibility was not enforced: %#v", result.Days[1].Tasks)
	}
}

func TestUpdateEventRequiresOwnerAndValidatesPatch(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	owner := createCalendarTestUser(t, app, "event-owner@example.com")
	other := createCalendarTestUser(t, app, "event-other@example.com")
	created, err := CreateEvent(context.Background(), app, owner.Id, CreateEventCommand{
		Title: "Review", StartAt: "2026-07-13T09:00:00Z", EndAt: "2026-07-13T10:00:00Z",
	})
	if err != nil {
		t.Fatal(err)
	}
	newTitle := "Updated review"
	updated, err := UpdateEvent(context.Background(), app, owner.Id, UpdateEventCommand{EventID: created.Event.ID, Title: &newTitle})
	if err != nil || updated.Event.Title != newTitle {
		t.Fatalf("update event: %#v, %v", updated, err)
	}
	if _, err := UpdateEvent(context.Background(), app, other.Id, UpdateEventCommand{EventID: created.Event.ID, Title: &newTitle}); err == nil {
		t.Fatal("non-owner updated a private event")
	}
	invalidEnd := "2026-07-13T08:00:00Z"
	if _, err := UpdateEvent(context.Background(), app, owner.Id, UpdateEventCommand{EventID: created.Event.ID, EndAt: &invalidEnd}); err == nil {
		t.Fatal("invalid event time range was accepted")
	}
}

func createCalendarTestUser(t *testing.T, app core.App, email string) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.SetEmail(email)
	record.SetPassword("password123")
	record.Set("name", email)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func createCalendarTestProject(t *testing.T, app core.App, ownerID, name string) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("board_projects")
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Set("owner", ownerID)
	record.Set("name", name)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func createCalendarTestState(t *testing.T, app core.App, projectID, name, category string) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("board_project_states")
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Set("project", projectID)
	record.Set("name", name)
	record.Set("color", "#64748b")
	record.Set("category", category)
	record.Set("sort_order", 1024)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func createCalendarTestMembership(t *testing.T, app core.App, projectID, userID string) {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("board_project_members")
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Set("project", projectID)
	record.Set("user", userID)
	record.Set("role", "member")
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
}

func createCalendarTestTask(t *testing.T, app core.App, projectID, stateID, creatorID, title, dueDate string) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("board_tasks")
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(collection)
	record.Set("project", projectID)
	record.Set("state", stateID)
	record.Set("title", title)
	record.Set("priority", "medium")
	record.Set("created_by", creatorID)
	record.Set("due_date", dueDate)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}
