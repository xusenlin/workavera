package calendar

import (
	"testing"
	"time"
)

func TestValidateEventValues(t *testing.T) {
	start := time.Date(2026, time.July, 12, 9, 0, 0, 0, time.UTC)
	end := start.Add(time.Hour)

	for _, test := range []struct {
		name      string
		title     string
		start     time.Time
		end       time.Time
		timezone  string
		color     string
		frequency string
		interval  float64
		reminder  float64
		wantError bool
	}{
		{name: "valid", title: "Standup", start: start, end: end, timezone: "Asia/Shanghai", color: "blue", frequency: "weekly", interval: 1, reminder: 10},
		{name: "blank title", title: "  ", start: start, end: end, timezone: "UTC", color: "blue", frequency: "none", interval: 1, reminder: -1, wantError: true},
		{name: "end before start", title: "Review", start: start, end: start, timezone: "UTC", color: "blue", frequency: "none", interval: 1, reminder: -1, wantError: true},
		{name: "bad timezone", title: "Review", start: start, end: end, timezone: "Mars/Base", color: "blue", frequency: "none", interval: 1, reminder: -1, wantError: true},
		{name: "bad color", title: "Review", start: start, end: end, timezone: "UTC", color: "pink", frequency: "none", interval: 1, reminder: -1, wantError: true},
		{name: "bad frequency", title: "Review", start: start, end: end, timezone: "UTC", color: "blue", frequency: "weekday", interval: 1, reminder: -1, wantError: true},
		{name: "fractional interval", title: "Review", start: start, end: end, timezone: "UTC", color: "blue", frequency: "none", interval: 1.5, reminder: -1, wantError: true},
		{name: "unsupported reminder", title: "Review", start: start, end: end, timezone: "UTC", color: "blue", frequency: "none", interval: 1, reminder: 17, wantError: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			err := validateEventValues(test.title, test.start, test.end, test.timezone, test.color, test.frequency, test.interval, test.reminder)
			if (err != nil) != test.wantError {
				t.Fatalf("validateEventValues() error = %v, wantError %v", err, test.wantError)
			}
		})
	}
}
