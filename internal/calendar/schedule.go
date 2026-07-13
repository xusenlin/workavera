package calendar

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/xusenlin/workavera/internal/configs"
)

const maxScheduleDates = 31

type EventOccurrence struct {
	Event
	OccurrenceDate string `json:"occurrenceDate"`
	InstanceStart  string `json:"instanceStart"`
	InstanceEnd    string `json:"instanceEnd"`
}

type ScheduleTask struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
	Priority    string `json:"priority"`
	DueDate     string `json:"dueDate"`
	ProjectID   string `json:"projectId"`
	ProjectName string `json:"projectName"`
	StateID     string `json:"stateId"`
	StateName   string `json:"stateName"`
	Completed   bool   `json:"completed"`
}

type ScheduleDay struct {
	Date   string            `json:"date"`
	Tasks  []ScheduleTask    `json:"tasks"`
	Events []EventOccurrence `json:"events"`
}

type ScheduleResult struct {
	Days []ScheduleDay `json:"days"`
}

func GetSchedule(ctx context.Context, app core.App, actorID string, dates []string) (ScheduleResult, error) {
	if err := requireActiveActor(ctx, app, actorID); err != nil {
		return ScheduleResult{}, err
	}
	parsedDates, err := normalizeDates(dates)
	if err != nil {
		return ScheduleResult{}, err
	}

	days := make([]ScheduleDay, len(parsedDates))
	dayByDate := make(map[string]*ScheduleDay, len(parsedDates))
	for index, date := range parsedDates {
		value := date.Format(time.DateOnly)
		days[index] = ScheduleDay{Date: value, Tasks: []ScheduleTask{}, Events: []EventOccurrence{}}
		dayByDate[value] = &days[index]
	}

	if err := addVisibleTasks(ctx, app, actorID, dayByDate); err != nil {
		return ScheduleResult{}, err
	}
	if err := addOwnedEvents(ctx, app, actorID, parsedDates, dayByDate); err != nil {
		return ScheduleResult{}, err
	}
	for index := range days {
		sort.Slice(days[index].Tasks, func(i, j int) bool {
			return days[index].Tasks[i].Title < days[index].Tasks[j].Title
		})
		sort.Slice(days[index].Events, func(i, j int) bool {
			return days[index].Events[i].InstanceStart < days[index].Events[j].InstanceStart
		})
	}
	return ScheduleResult{Days: days}, nil
}

func normalizeDates(values []string) ([]time.Time, error) {
	if len(values) == 0 {
		return nil, errors.New("at least one date is required")
	}
	if len(values) > maxScheduleDates {
		return nil, errors.New("at most 31 dates can be requested")
	}
	seen := make(map[string]bool, len(values))
	result := make([]time.Time, 0, len(values))
	for _, value := range values {
		date, err := time.Parse(time.DateOnly, strings.TrimSpace(value))
		if err != nil {
			return nil, errors.New("dates must use YYYY-MM-DD format")
		}
		key := date.Format(time.DateOnly)
		if !seen[key] {
			seen[key] = true
			result = append(result, date)
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Before(result[j]) })
	return result, nil
}

func addVisibleTasks(ctx context.Context, app core.App, actorID string, days map[string]*ScheduleDay) error {
	visibleProjects, err := visibleProjectRecords(app, actorID)
	if err != nil {
		return err
	}
	dateClauses := make([]string, 0, len(days))
	params := dbx.Params{}
	index := 0
	for value := range days {
		date, _ := time.Parse(time.DateOnly, value)
		startKey := fmt.Sprintf("start%d", index)
		endKey := fmt.Sprintf("end%d", index)
		dateClauses = append(dateClauses, "(due_date >= {:"+startKey+"} && due_date < {:"+endKey+"})")
		params[startKey] = date.Format(time.DateOnly) + " 00:00:00.000Z"
		params[endKey] = date.AddDate(0, 0, 1).Format(time.DateOnly) + " 00:00:00.000Z"
		index++
	}
	tasks, err := app.FindRecordsByFilter("board_tasks", strings.Join(dateClauses, " || "), "due_date", 0, 0, params)
	if err != nil {
		return err
	}
	statesByID := make(map[string]*core.Record)

	for _, task := range tasks {
		if err := ctx.Err(); err != nil {
			return err
		}
		day := days[datePart(task.GetString("due_date"))]
		project := visibleProjects[task.GetString("project")]
		if day == nil || project == nil {
			continue
		}
		stateID := task.GetString("state")
		state := statesByID[stateID]
		if state == nil {
			state, _ = app.FindRecordById("board_project_states", stateID)
			if state != nil {
				statesByID[stateID] = state
			}
		}
		item := ScheduleTask{
			ID:          task.Id,
			Title:       task.GetString("title"),
			Description: task.GetString("description"),
			Priority:    task.GetString("priority"),
			DueDate:     datePart(task.GetString("due_date")),
			ProjectID:   project.Id,
			ProjectName: project.GetString("name"),
			StateID:     task.GetString("state"),
		}
		if state != nil {
			item.StateName = state.GetString("name")
			item.Completed = state.GetString("category") == "completed"
		}
		day.Tasks = append(day.Tasks, item)
	}
	return nil
}

func visibleProjectRecords(app core.App, actorID string) (map[string]*core.Record, error) {
	result := make(map[string]*core.Record)
	owned, err := app.FindRecordsByFilter("board_projects", "owner = {:actor}", "", 0, 0, dbx.Params{"actor": actorID})
	if err != nil {
		return nil, err
	}
	for _, project := range owned {
		result[project.Id] = project
	}
	memberships, err := app.FindRecordsByFilter("board_project_members", "user = {:actor}", "", 0, 0, dbx.Params{"actor": actorID})
	if err != nil {
		return nil, err
	}
	projectClauses := make([]string, 0, len(memberships))
	projectParams := dbx.Params{}
	for _, membership := range memberships {
		projectID := membership.GetString("project")
		if result[projectID] != nil {
			continue
		}
		key := fmt.Sprintf("project%d", len(projectClauses))
		projectClauses = append(projectClauses, "id = {:"+key+"}")
		projectParams[key] = projectID
	}
	if len(projectClauses) == 0 {
		return result, nil
	}
	projects, err := app.FindRecordsByFilter("board_projects", "("+strings.Join(projectClauses, " || ")+")", "", 0, 0, projectParams)
	if err != nil {
		return nil, err
	}
	for _, project := range projects {
		result[project.Id] = project
	}
	return result, nil
}

func addOwnedEvents(ctx context.Context, app core.App, actorID string, dates []time.Time, days map[string]*ScheduleDay) error {
	location := configs.SystemLocation(app)
	first := dates[0]
	last := dates[len(dates)-1]
	start := time.Date(first.Year(), first.Month(), first.Day(), 0, 0, 0, 0, location).UTC()
	end := time.Date(last.Year(), last.Month(), last.Day(), 0, 0, 0, 0, location).AddDate(0, 0, 1).UTC()
	events, err := app.FindRecordsByFilter(
		eventsCollection,
		"owner = {:actor} && (recurrence_frequency != 'none' || (start_at >= {:start} && start_at < {:end}))",
		"start_at",
		0,
		0,
		dbx.Params{"actor": actorID, "start": start, "end": end},
	)
	if err != nil {
		return err
	}
	for _, record := range events {
		for _, date := range dates {
			if err := ctx.Err(); err != nil {
				return err
			}
			occurrence, ok := occurrenceOnDate(record, date)
			if ok {
				days[date.Format(time.DateOnly)].Events = append(days[date.Format(time.DateOnly)].Events, occurrence)
			}
		}
	}
	return nil
}

func occurrenceOnDate(record *core.Record, requested time.Time) (EventOccurrence, bool) {
	location, err := time.LoadLocation(record.GetString("timezone"))
	if err != nil {
		return EventOccurrence{}, false
	}
	start := record.GetDateTime("start_at").Time().In(location)
	end := record.GetDateTime("end_at").Time().In(location)
	target := time.Date(requested.Year(), requested.Month(), requested.Day(), start.Hour(), start.Minute(), start.Second(), start.Nanosecond(), location)
	if !eventOccursOn(start, target, record.GetString("recurrence_frequency"), max(1, record.GetInt("recurrence_interval"))) {
		return EventOccurrence{}, false
	}
	if record.GetString("recurrence_frequency") == "none" {
		target = start
	}
	instanceEnd := target.Add(end.Sub(start))
	return EventOccurrence{
		Event:          eventFromRecord(record),
		OccurrenceDate: requested.Format(time.DateOnly),
		InstanceStart:  target.Format(time.RFC3339),
		InstanceEnd:    instanceEnd.Format(time.RFC3339),
	}, true
}

// OccurrenceOnDate returns the event occurrence on requested in the provided
// system location. Notification scheduling uses this to keep all reminders on
// the configured system timezone instead of the process or browser timezone.
func OccurrenceOnDate(record *core.Record, requested time.Time, location *time.Location) (EventOccurrence, bool) {
	if location == nil {
		return EventOccurrence{}, false
	}
	start := record.GetDateTime("start_at").Time().In(location)
	end := record.GetDateTime("end_at").Time().In(location)
	target := time.Date(requested.In(location).Year(), requested.In(location).Month(), requested.In(location).Day(), start.Hour(), start.Minute(), start.Second(), start.Nanosecond(), location)
	if !eventOccursOn(start, target, record.GetString("recurrence_frequency"), max(1, record.GetInt("recurrence_interval"))) {
		return EventOccurrence{}, false
	}
	if record.GetString("recurrence_frequency") == "none" {
		target = start
	}
	return EventOccurrence{
		Event:          eventFromRecord(record),
		OccurrenceDate: target.Format(time.DateOnly),
		InstanceStart:  target.Format(time.RFC3339),
		InstanceEnd:    target.Add(end.Sub(start)).Format(time.RFC3339),
	}, true
}

func eventOccursOn(start, target time.Time, frequency string, interval int) bool {
	startDate := time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.UTC)
	targetDate := time.Date(target.Year(), target.Month(), target.Day(), 0, 0, 0, 0, time.UTC)
	days := int(targetDate.Sub(startDate).Hours() / 24)
	if days < 0 {
		return false
	}
	switch frequency {
	case "none":
		return days == 0
	case "daily":
		return days%interval == 0
	case "weekly":
		return days%(7*interval) == 0
	case "monthly":
		months := (target.Year()-start.Year())*12 + int(target.Month()-start.Month())
		return months >= 0 && months%interval == 0 && target.Day() == start.Day()
	case "yearly":
		years := target.Year() - start.Year()
		return years >= 0 && years%interval == 0 && target.Month() == start.Month() && target.Day() == start.Day()
	default:
		return false
	}
}

func datePart(value string) string {
	if len(value) >= len(time.DateOnly) {
		return value[:len(time.DateOnly)]
	}
	return value
}
