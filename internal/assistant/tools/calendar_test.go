package tools

import (
	"testing"
	"time"
)

func TestCalendarLocalDateTimeUsesConfiguredTimezone(t *testing.T) {
	location, err := time.LoadLocation("America/Los_Angeles")
	if err != nil {
		t.Fatal(err)
	}

	got, err := calendarLocalDateTime("2026-08-11T09:00:00", location)
	if err != nil {
		t.Fatal(err)
	}
	if got != "2026-08-11T09:00:00-07:00" {
		t.Fatalf("unexpected date-time: %s", got)
	}
}

func TestCalendarLocalDateTimeRejectsOffsetAndMissingWallTime(t *testing.T) {
	location, err := time.LoadLocation("America/Los_Angeles")
	if err != nil {
		t.Fatal(err)
	}

	for _, value := range []string{"2026-08-11T09:00:00-07:00", "2026-03-08T02:30:00"} {
		if _, err := calendarLocalDateTime(value, location); err == nil {
			t.Fatalf("expected %q to be rejected", value)
		}
	}
}
