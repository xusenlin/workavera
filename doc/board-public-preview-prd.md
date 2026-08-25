# Board Public Preview Product Requirements

[中文](./board-public-preview-prd.zh-CN.md)

> Implementation baseline: Workavera `0.1.1`.

## 1. Purpose

A Board public preview lets a project owner publish a project as an unguessable
link that anyone can open without an account and see at a glance what the
project is, how many tasks it holds, how many sit in each state, who the team
is, and for every task which day it starts, how long it runs, what each day
holds, and what is already finished.

It is the Board counterpart of Docs public sharing (`/s/{slug}`): the creator
controls it, the link cannot be enumerated, and revoking or expiring it takes
effect immediately. What it serves is not a snapshot, though, but the project as
it stands right now.

To express "how long it runs", the feature gives tasks an optional start date.
That is a data model change reaching beyond the preview itself, and section 6
covers its full scope.

## 2. Goals

- Give a task an optional start date, so a task is a span rather than a single
  deadline.
- Let a project owner publish a project, set an optional expiry, copy the link,
  and revoke it at any time.
- Serve anonymous visitors a read-only project preview at `/p/{slug}`.
- Put the project name, description, date span, task total, and per-state task
  counts within the first screen.
- List the project participants (owner and members) by name and avatar.
- Make the body a calendar timeline: tasks span from their start to their due
  date, and each day can be read on its own.
- Render tasks with the same task card the board uses, expandable into a
  read-only detail.
- Link a task's documents straight to their own public link, and say plainly
  when the author has not shared one.
- Offer a refresh button so a visitor can pull the project's latest progress.

## 3. Non-goals

- Any write by an anonymous visitor: comments, claiming, dragging, editing,
  exporting.
- Live updates on the public page (PocketBase realtime requires auth, and
  anonymous subscriptions are out of scope).
- Dragging task dates on the timeline, or dependencies, milestones, and critical
  paths between tasks.
- An enumerable directory of public projects, SEO indexing, or social preview
  cards.
- Link passwords, visit counts, visitor lists, or an instance-wide switch that
  turns sharing off.
- Sharing granularity below a project (by state, member, or label).
- Public links for archived projects, and showing archived tasks, activity logs,
  or project settings on the public page.

## 4. Core rules

1. Only the project owner can publish, set an expiry, or revoke a link, matching
   who can archive and delete a project; admin, member, and viewer roles grant no
   sharing rights.
2. A project has at most one share. Revoking deletes the record, so publishing
   again issues a new slug instead of reviving the old link.
3. The public page reflects the project's **current** state rather than a pinned
   snapshot. Tasks added or changed after publishing become visible at once, by
   design: the value of project progress is that it is current. The owner
   controls the exposure window by revoking or expiring the link.
4. A link stops working the moment it expires, is revoked, or its project is
   archived or deleted. All of these return exactly the same response, so the
   link never reveals which one happened.
5. The public page carries active tasks only. Archived tasks, activity logs,
   project preferences, task assignees, member roles, member emails, and every
   user identifier stay on the server. The team appears only as a whole, in the
   members section.
6. A linked document exposes its title and whether it currently has a live
   public link of its own. When it does, its slug is included; when it does not,
   no identifier is, and the page says the author has not shared it.
7. The public endpoints accept no authentication and return no more to a visitor
   who happens to be signed in: the owner and a stranger see exactly the same
   thing.
8. Publishing, re-dating, and revoking never modify the project or its tasks.
9. A task's `start_date` is optional. When set it must fall on or before
   `due_date`, validated in the shared command layer and the PocketBase write
   hook alike, the same layer as the existing cross-project relation checks.

## 5. Data model

### `board_project_shares` (new)

| Field | Type | Notes |
| --- | --- | --- |
| `project` | relation → board_projects | Required, unique, cascade delete |
| `slug` | text | Unique 22-character lowercase alphanumeric public identifier |
| `expires` | date | Optional; empty means the link does not expire |
| `created_by` | relation → users | The project owner who published it |
| `created`, `updated` | autodate | Record timestamps |

Structurally identical to `doc_shares` except that it stores no `revision` — the
public page follows the project's current state, so there is nothing to pin.
The share is its own record, so publishing, re-dating, and revoking never touch
the project or its tasks.

Owners read the shares of their own projects through PocketBase list/view rules
(`@request.auth.id != "" && project.owner = @request.auth.id`); every write goes
through the Board sharing endpoints, so a client can never choose a slug.
`project` and `slug` each carry a unique index.

### `board_tasks.start_date` (new field)

| Field | Type | Notes |
| --- | --- | --- |
| `start_date` | date | Optional start date; when set, not after `due_date` |

Every other Board collection and both `docs` and `doc_shares` are unchanged.

## 6. Scope of the task start date

`start_date` is the one change to existing data, and it runs the length of the
task pipeline:

- **Migration**: an optional date field with its rollback and a migration test.
  Existing tasks leave it empty and behave exactly as they do today.
- **Server validation**: the task write paths in `internal/board` enforce
  `start_date <= due_date`; either date alone remains valid.
- **Board UI**: the task detail form gains a start date picker beside the due
  date, with immediate feedback on an inverted span. Board task cards are
  unchanged and still show the deadline alone, so columns stay uncrowded.
- **Assistant tools**: `board_create_task` and `board_update_task` gain a
  `startDate` argument following the existing patch semantics — null clears it.
- **Mobile**: the Android and iOS clients follow in their own repositories and
  are out of scope here. A client that does not know the field simply does not
  show it, and writing a task does not clear it.

The two dates together decide a task's span on the timeline:

| `start_date` | `due_date` | On the timeline |
| --- | --- | --- |
| Set | Set | A bar from the start day through the due day |
| Unset | Set | A single-day bar on the due day |
| Set | Unset | A single-day bar on the start day |
| Unset | Unset | Off the timeline, under `Unscheduled` |

## 7. The public page

The page opens at `/p/{slug}`, outside the authenticated shell and, like
`/s/{slug}`, without app navigation, sidebar, or account controls. The browser
tab carries the project name.

Dates read in English by default and switch to Chinese formatting when the link
carries `?lang=zh`: `Aug 13 – Sep 6` becomes `8月13日 – 9月6日`,
`Thursday, Aug 13` becomes `8月13日 星期四`, the month axis becomes `2026年9月`,
and the relative time becomes `更新于 不到 1 分钟前`. Chinese dates are not the
English patterns word by word — they order the parts differently and carry
their own separators — so each language names its own pattern. The parameter
reaches dates and the labels attached to them and nothing else; the rest of the
interface keeps its wording. Any value starting with `zh` selects Chinese, and
everything else falls back to the default.

### Overview

- Project name and description.
- The date span, e.g. `Aug 3 – Sep 12`, with years when it crosses one; absent
  when no task carries a date.
- The task total plus per-state count chips in each state's own color, ordered
  by `sort_order`, e.g. `Todo 4 · In Progress 3 · Done 12`.
- Progress: the share of tasks in `completed` states, as a thin bar.
- A refresh button: an icon button that reloads the whole preview and spins
  while it does, with a relative `Updated 2 minutes ago` beside it. Repeated
  clicks are throttled to one per second so they cannot spin uselessly.
- Everything above the progress bar sticks to the top of the page while the
  visitor scrolls, so deep into the timeline they still know which project they
  are reading and how much of it is done. The progress bar itself scrolls away.
  A sticky element only travels as far as its own parent, so this block has to
  be a direct child of the page column rather than sit in a wrapper of its own.
- Its height depends on how long the project's description is, so it measures
  itself with a `ResizeObserver` and publishes the result as
  `--public-header-height`; the day headers dock right below it instead of
  assuming a height.

### Members

The owner and members appear as one row of avatars and names, the owner first
and marked `Owner`. No roles, emails, or other contact details, and no
indication of who owns which task. Avatars come from the share's own proxy
endpoint addressed by a member's position in the list, so not even a user id
appears in the response.

### The calendar timeline

The timeline is the body of the page. It has two layers over the same date range
(the earliest start to the latest due date).

**The span layer**: a horizontal date axis with a bar per task. Tasks group by
state and, within a group, are packed into lanes after sorting by start date —
tasks that do not overlap in time share a row, so the height follows how much
runs in parallel rather than how many tasks exist, and dozens of tasks still fit
one screen while the state grouping lays out "how many in each state" by itself.
Bars carry their state's color and the task title, and a completed bar dims and
leads with a check. Today runs through it as a vertical line. A span wider than
the screen scrolls horizontally and lands on today at first load; a very long
span switches the axis to weekly ticks without moving the bars. Clicking a bar
opens the task detail.

**The day layer**: below it, a list grouped by day from earliest to latest,
answering "what is happening on this day".

- Each day has a sticky header: weekday, date, the day's task count, and
  `3 of 5 done`. It docks below the overview rather than overlapping it.
- A task appears on every day its span covers: the full card on its first day, a
  compact row afterwards (title, state dot, `Day 2 of 5`).
- A day with more than six tasks shows the first six and folds the rest behind
  `+3 more`, which expands and collapses again. Six fills two rows on a wide
  screen, enough to read a busy day; without the fold a single day would push
  the ones after it far down the page. `Unscheduled` follows the same rule.
- Today's group is highlighted. A day with no tasks collapses to a thin tick, so
  time still reads continuously without stretching the page.
- `Unscheduled` sits last and holds tasks with neither date.
- Completed tasks dim their title and lead with a check.
- Narrow screens hide the span layer and keep the day layer in a single column.

### The task card

The card reuses the board's visuals: label chips, title, description summary,
priority, dates, and linked document count. The presentation half of
`todo-card.tsx` is extracted into a pure component that takes resolved labels
and priority as props and can hide assignees; the board's `TodoCard` keeps
dragging and archiving and renders it, and the public page renders it directly,
so neither side carries its own copy of the card. The public card is not
draggable, has no archive button, shows no assignees, and reads its dates as a
span (`Aug 3 – Aug 7`) or a single day.

### The task detail

Clicking a card or a bar opens a read-only dialog: title, full description,
state, priority, labels, start and due dates, and the linked documents. It shows
no assignees, no creator, and no activity.

- A document with a live public link is clickable and opens `/s/{doc-slug}` in a
  new tab.
- Every other document is dimmed and not clickable, with a
  `Not shared by the author` note.

### An unavailable link

The same as the public document page: the link is not available, it may have
expired, been revoked, or never existed. No distinction between them, and
nothing about whether the project exists.

### How it is built

The timeline adds no dependency: it is CSS Grid plus the `date-fns` already in
the project. Stripped of interaction it is a layout problem — mapping a task's
`[start, due]` onto grid columns, which `grid-column: start / span n` states
directly, with colors, radii, and dark mode following the existing Tailwind
tokens so it matches the board for free.

The available calendar and Gantt libraries do not fit: FullCalendar's timeline
view is commercially licensed and the free build cannot produce this shape;
react-big-calendar thinks in weeks and agendas and cannot give a project-span
overview; gantt-task-react and its peers are built for draggable editing, while
this page is read-only, and their inline styles resist theming. The public page
is also an anonymous first load, where the saved bytes are worth something.
`react-day-picker` (`ui/calendar`) keeps doing date selection alone, and the
share dialog's expiry reuses `ui/date-picker`.

- The axis comes from `eachDayOfInterval`; a bar starts at
  `differenceInCalendarDays(taskStart, rangeStart) + 1` and spans the days
  between its dates plus one.
- Column width follows the span: 48px per day up to 60 days, with titles inside
  the bars; 24px from 61 to 180 days, with titles moving to tooltips; beyond 180
  days one column per week, positioned with `differenceInCalendarWeeks`.
- The axis stacks a month row over a day row and sticks to the top, weekend
  columns take a light background, today is an absolutely positioned line, and
  the first load scrolls it a third of the way in from the left.
- Range math, width tiers, and lane packing live as pure functions in
  `frontend/src/lib/timeline.ts`, and both languages' date patterns and
  formatting in `frontend/src/lib/date-format.ts`.

## 8. Publishing

- The entry point is a share icon on the right of the project title row, beside
  the copy-reference and archived-tasks icons, visible to the project owner
  only. It turns green once a link exists, so the board shows at a glance which
  projects are public; the share state is therefore read as the project renders
  rather than when the dialog opens.
- The share dialog creates the link, copies it, opens it in a new tab, picks the
  date language, sets or clears the expiry, and revokes it.
- A checkbox beside the link controls whether `?lang=zh` is appended, and both
  copying and opening then carry it — the parameter is documented and usable in
  one place instead of typed by hand. It only affects date formatting, so it
  belongs to the link handed out rather than to the share record.
- The dialog states that the public page reflects current progress, and lists
  what is visible (task titles and descriptions, states, labels, dates, member
  names and avatars) against what is not (archived tasks, activity records, task
  assignees, member emails and roles).
- Revoking says plainly that the old link cannot be restored.
- The dialog also notes that archiving or deleting the project takes the link
  down immediately, since archiving is a single-step action and the warning
  belongs at the sharing entry point rather than in its way.

## 9. HTTP API

Authenticated (`apis.RequireAuth("users")`, project owner only):

- `GET /api/board/projects/{id}/share`
- `POST /api/board/projects/{id}/share`, accepting an optional `expires`
- `DELETE /api/board/projects/{id}/share`

Anonymous:

- `GET /api/public/board/{slug}`
- `GET /api/public/board/{slug}/avatars/{index}`

The anonymous endpoints are the only ones a visitor can reach. The first
resolves a slug to its share, checks the expiry and the project's archive state,
and returns everything the page needs in one response:

```jsonc
{
  "project": { "name", "description", "start", "end", "taskCount", "completedCount" },
  "states":  [{ "id", "name", "color", "category", "sortOrder", "taskCount" }],
  "members": [{ "name", "avatar": 1, "owner": true }],
  "tasks":   [{ "id", "title", "description", "stateId", "priority",
                "startDate", "dueDate",
                "labels": [{ "name", "color" }],
                "documents": [{ "title", "slug" }] }]
}
```

Tasks carry no assignees, no creator, and no user ids. `members[].avatar` is the
member's position in that list rather than a filename or a user id; the avatar
endpoint takes the same index, and the field is absent for a member without one.
`documents[].slug` appears only while that document has a live public link.
Tasks are ordered by start date and then `rank`, and at most 2,000 active tasks
are returned at once.

These are custom endpoints rather than PocketBase rules because an anonymous
request has to trade a slug for records in five other collections, check the
expiry, strip user identities and roles, and look up `doc_shares` for every
linked document — a chain that API rules cannot express. Avatars go through a
proxy instead of a file URL because a PocketBase file URL necessarily carries
the user's record id, and the proxy keeps "the team appears by name and avatar
only" without exceptions. Reading a share still uses PocketBase CRUD; only
writes need an endpoint, to allocate the slug.

## 10. Acceptance criteria

- A task accepts an optional start date; the server rejects a start after the
  due date, and either date alone is valid.
- Existing tasks without a start date behave unchanged and sit on their due day.
- Only the project owner sees the sharing entry point and can publish, re-date,
  or revoke; admin, member, and viewer calls are refused.
- Publishing after a revoke yields a new slug and the old link stays dead.
- Expiry, revocation, project archiving, and project deletion all return the
  same unavailable response.
- An anonymous visitor can browse the whole public page with no account and no
  client installed.
- The public response contains no task assignees, member emails, member roles,
  task creators, activity logs, or archived tasks.
- After tasks are added, changed, or completed, a visitor sees the new state by
  pressing refresh, with no republishing.
- The timeline covers the project span: multi-day tasks render as bars and
  appear on every day they cover; dateless tasks fall under `Unscheduled`.
- A day with more than six tasks folds, expands to all of them, and folds back
  to six.
- The overview's task total and per-state counts match the project's active
  tasks.
- In the task detail, a shared document opens its public link and reads
  normally; an unshared one is not clickable and says the author has not shared
  it.
- The public page and the board render the same task card component.
- Dates read in English by default and in Chinese formatting under `?lang=zh`,
  across the overview, the timeline axis, the day headers, the task cards, and
  the task detail.
- The overview above the progress bar stays at the top of the page while the
  visitor scrolls, and day headers dock below it without being covered.
- The public endpoints never reveal whether a project exists.
