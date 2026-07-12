package migrations

import (
	"slices"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestCalendarEventsMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	events, err := app.FindCollectionByNameOrId(calendarEventsCollection)
	if err != nil {
		t.Fatal(err)
	}
	if events.ListRule == nil || events.CreateRule == nil || events.UpdateRule == nil || events.DeleteRule == nil {
		t.Fatal("calendar events must have owner-scoped API rules")
	}
	owner, ok := events.Fields.GetByName("owner").(*core.RelationField)
	if !ok || !owner.Required || !owner.CascadeDelete || owner.MaxSelect != 1 {
		t.Fatalf("unexpected owner field: %#v", owner)
	}
	frequency, ok := events.Fields.GetByName("recurrence_frequency").(*core.SelectField)
	if !ok || !slices.Equal(frequency.Values, []string{"none", "daily", "weekly", "monthly", "yearly"}) {
		t.Fatalf("unexpected recurrence frequency: %#v", frequency)
	}
	interval, ok := events.Fields.GetByName("recurrence_interval").(*core.NumberField)
	if !ok || interval.Min == nil || *interval.Min != 1 {
		t.Fatalf("unexpected recurrence interval: %#v", interval)
	}
	reminder, ok := events.Fields.GetByName("reminder_minutes_before").(*core.NumberField)
	if !ok || reminder.Min == nil || *reminder.Min != -1 {
		t.Fatalf("unexpected reminder field: %#v", reminder)
	}
}
