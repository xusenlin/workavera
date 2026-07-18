# Calendar Product Requirements Document

[简体中文](./calendar-prd.zh-CN.md)

> Implementation baseline: Workavera `0.0.2`, verified against commit `3684be1` on 2026-07-13.

## 1. Purpose

Calendar is Workavera's time-commitment layer. It presents personal calendar events and visible Board task deadlines in one place, using the administrator-configured system timezone for editing, recurrence expansion, AI operations, and reminder scheduling.

## 2. Goals

- Create, read, edit, and delete private calendar events.
- Display due-dated Board tasks that the current user can access.
- Support all-day and timed events, colors, location, description, simple recurrence, and reminders.
- Provide day, week, mini-calendar, and all-custom-events views.
- Persist events in PocketBase and synchronize event/task changes in real time.
- Deliver deduplicated in-app reminders for configured event occurrences.
- Let Chat query schedules and create or update personal events.

## 3. Non-goals

- Shared events, guests, invitations, or per-event visibility settings.
- External calendar import, export, or synchronization.
- Complex RRULE patterns, multiple weekdays, recurrence end dates, or occurrence counts.
- Editing or deleting a single occurrence; mutations apply to the entire series.
- Email, browser-push, SMS, or mobile-push delivery.
- Editing or deleting Board tasks from Calendar.
- Event deletion through Assistant tools.

## 4. Calendar item types

Calendar merges two sources in the presentation layer:

| Type | Source | Time semantics | Interaction |
| --- | --- | --- | --- |
| Event | `calendar_events` | Timed or all-day; may repeat | Opens the event sheet |
| Task | `board_tasks` | `due_date` shown as an all-day deadline | Opens the task in Board |

The records remain independent. UI keys are namespaced as `event:<id>` and `task:<id>`.

## 5. Event data model

### `calendar_events`

| Field | Type | Notes |
| --- | --- | --- |
| `owner` | relation → users | Required; cascade delete |
| `title` | text | Required, max 240 characters |
| `description` | text | Optional, max 10,000 characters |
| `start_at` | date | Required instant |
| `end_at` | date | Required and later than `start_at` |
| `all_day` | bool | All-day presentation flag |
| `timezone` | text | IANA timezone copied from `system.timezone` |
| `location` | text | Optional place or meeting URL, max 500 characters |
| `color` | select | `blue`, `green`, `amber`, `red`, or `purple` |
| `recurrence_frequency` | select | `none`, `daily`, `weekly`, `monthly`, or `yearly` |
| `recurrence_interval` | number | Positive whole number |
| `reminder_minutes_before` | number | `-1`, `0`, `5`, `10`, `30`, `60`, or `1440` |
| `created`, `updated` | autodate | Record timestamps |

Events are indexed by `owner, start_at`.

## 6. Timezone and recurrence rules

- `configs/system.timezone` is the authoritative IANA timezone; the default seed value is `Asia/Shanghai`.
- The server overwrites an event's `timezone` with the configured system timezone on create and update.
- The UI converts local date/time input in the system timezone to instants before persistence.
- AI event tools accept `YYYY-MM-DDTHH:MM:SS` local values and parse them in the system timezone.
- A repeating series stores one base record and expands occurrences for requested dates.
- Daily recurrence advances by calendar days; weekly recurrence preserves the weekday.
- Monthly recurrence preserves the day of month and skips months without that day.
- Yearly recurrence preserves month and day; February 29 appears only in leap years.
- `recurrence_interval` applies to the selected unit, such as every two weeks.
- A non-repeating event appears on its start date. An occurrence keeps the base event duration.

## 7. Reminders and notifications

The notification scheduler runs every six minutes and uses the system timezone.

- Events with `reminder_minutes_before >= 0` generate an in-app `calendar_event` notification when the reminder time is due.
- Repeating events are expanded around the scheduler window before reminder evaluation.
- The dedupe key contains event ID, occurrence start, and recipient, so one occurrence produces at most one notification per owner.
- Notification data includes `eventId`, `occurrenceDate`, and `instanceStart` for deep linking.
- Realtime notification subscriptions update the header dropdown and Notifications page.

Board tasks also generate a `task_due` notification after 09:00 on their due date when their state is not completed. Assignees receive the notification; an unassigned task falls back to the project owner.

## 8. User experience

- The header provides Previous, Today, Next, and New event actions.
- The left panel contains a mini-calendar, Day/Week selectors, and All custom events.
- The mini-calendar marks dates containing expanded events or task deadlines.
- Day and Week views put all-day task deadlines before timed events and sort events by start time.
- All custom events lists every owned base event, including repeating series, sorted by base start time.
- The right-side event sheet edits title, date, start/end time, all-day status, recurrence, reminder, color, location, and description.
- Editing or deleting a repeating event clearly states that the entire series is affected.
- Task items display project, priority, and completion state and deep-link to Board.
- URLs use the shared `record` query parameter; event notifications may also include an `occurrence` date.

## 9. Permissions and realtime

- List/View: authenticated owner only.
- Create: authenticated user for themselves; the server enforces `owner = auth.id`.
- Update/Delete: owner only; owner cannot be changed.
- Board task visibility continues to follow Board project owner/member access.

The frontend loads owned events, visible due-dated tasks, and the system timezone, then subscribes to `calendar_events` and `board_tasks`. Record changes update the combined calendar without a page refresh.

## 10. Assistant tools

### `calendar_get_schedule`

- Accepts one to 31 unique `YYYY-MM-DD` dates.
- Returns a sorted day list containing all personal event occurrences and visible Board task deadlines.
- Returns event IDs, occurrence dates, instance start/end values, project/task metadata, and completed state.

### `calendar_create_event`

- Creates one to 50 events owned by the current user after an explicit request; a single event uses a one-item `items` array.
- Requires local start and end values in the configured system timezone.
- Applies the same color, recurrence, interval, reminder, and time validation as the UI.

### `calendar_update_event`

- Patches one to 50 owned events identified through schedule lookup using the required `items` array.
- Omitted fields remain unchanged; empty description or location clears the field.
- Updates the whole repeating series.
- Cannot modify Board tasks.

Create and update batches execute in order, return per-event success or failure, and continue after an individual failure. Legacy top-level single-event inputs are not accepted.

No Calendar deletion tool is registered.

## 11. Acceptance criteria

- Personal events remain private and persist across refreshes.
- Timed, all-day, and repeating events render on the correct local date in the configured system timezone.
- Invalid titles, time ranges, colors, recurrence settings, and reminder values are rejected by the server.
- Editing or deleting a repeating event affects the complete series.
- Visible Board deadlines appear without becoming editable Calendar events.
- Day, Week, mini-calendar, and All custom events views remain consistent.
- Eligible event reminders and task-due reminders create one deduplicated in-app notification per recipient and occurrence/date.
- Two sessions for the same user receive realtime event and notification updates.
- Assistant schedule results match the UI's timezone, recurrence, visibility, and completion rules.
- Assistant event mutations support one-item and multi-item batches up to 50 records and report accurate mixed-success results.
