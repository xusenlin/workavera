# Board Product Requirements Document

[简体中文](./board-prd.zh-CN.md)

> Implementation baseline: Workavera `0.0.2`, verified against commit `3684be1` on 2026-07-13.

## 1. Purpose

Board is Workavera's action layer. It turns plans produced in Chat, Docs, Reading, and Contacts into projects and tasks with an owner, workflow, priority, assignees, labels, due dates, linked documents, and an audit trail.

Board data is persisted in PocketBase and synchronized in real time. Every project owns an independent workflow and label set; templates are copied only when a project is created.

## 2. Goals

- Create a blank project or copy one of the built-in bilingual templates.
- Let each project owner manage its workflow, labels, members, and ownership.
- Let eligible participants create, edit, move, reorder, and delete tasks.
- Keep owner identity canonical in `board_projects.owner`; store only collaborators in `board_project_members`.
- Validate every project-scoped relationship on the server.
- Record project and task changes in read-only activity collections.
- Synchronize projects, states, members, labels, and tasks between sessions.
- Let tasks link to reusable Docs from the same project.
- Expose permission-aware, non-destructive Board tools to Chat.

## 3. Non-goals

- Synchronizing later template changes into existing projects.
- Applying a template to an existing project.
- Automatically moving tasks when a state is deleted; a non-empty state cannot be deleted.
- Task comments, file attachments, subtasks, dependencies, or estimates.
- Destructive Board operations through AI tools.
- Ownership transfer through AI tools; it remains a confirmed UI operation.

## 4. Roles and core rules

Project participants are the project owner plus distinct member records.

| Role | Read project | Edit tasks | Manage workflow, labels, and members | Edit/delete project | Transfer ownership |
| --- | --- | --- | --- | --- | --- |
| Owner | Yes | Yes | Yes | Yes | Yes |
| Admin | Yes | Yes | No | No | No |
| Member | Yes | Yes | No | No | No |
| Viewer | Yes | No | No | No | No |

Core invariants:

1. A project may have no states, but a task must have a state. A blank project therefore cannot contain tasks until a state is added.
2. A task's state and labels must belong to its project.
3. Every assignee must be the project owner or a project member.
4. Every linked document must be a project document from the same project. Private and cross-project documents are rejected.
5. A state containing tasks cannot be deleted.
6. The owner must not also have a member record.
7. Only the current owner may change project settings or transfer ownership.
8. Ownership transfer removes any member record for the new owner, changes `board_projects.owner`, adds the previous owner as a `member`, and records the transfer in one transaction.
9. Server hooks and the shared command layer enforce task-write permissions even when PocketBase Records APIs are used directly.

## 5. Data model

### `board_templates`

| Field | Type | Notes |
| --- | --- | --- |
| `name` | text | Required; unique per owner scope |
| `description` | text | Optional usage guidance |
| `owner` | relation → users | Empty for built-in templates; populated for personal templates |
| `states` | JSON | Ordered `name`, `color`, and `category` definitions |
| `labels` | JSON | `name` and `color` definitions |

State categories are `pending`, `active`, and `completed`. Built-in templates are readable by authenticated users and writable only through administrative access; personal templates are owner-scoped.

### `board_projects`

| Field | Type | Notes |
| --- | --- | --- |
| `name` | text | Required, max 160 characters |
| `description` | text | Optional, max 2,000 characters |
| `owner` | relation → users | Required, canonical owner |
| `archived` | bool | Excluded from the active Board list |
| `created`, `updated` | autodate | Record timestamps |

### `board_project_states`

| Field | Type | Notes |
| --- | --- | --- |
| `project` | relation → board_projects | Required, cascade delete |
| `name` | text | Required; unique within the project |
| `color` | text | Required |
| `category` | select | `pending`, `active`, or `completed` |
| `sort_order` | number | Column order; new states use 1,024-point spacing |

### `board_project_members`

| Field | Type | Notes |
| --- | --- | --- |
| `project` | relation → board_projects | Required, cascade delete |
| `user` | relation → users | Required |
| `role` | select | `admin`, `member`, or `viewer` |

`project + user` is unique. The project owner is never duplicated here.

### `board_project_labels`

| Field | Type | Notes |
| --- | --- | --- |
| `project` | relation → board_projects | Required, cascade delete |
| `name` | text | Required; unique within the project |
| `color` | text | Required |

### `board_tasks`

| Field | Type | Notes |
| --- | --- | --- |
| `project` | relation → board_projects | Required, cascade delete |
| `state` | relation → board_project_states | Required |
| `title` | text | Required, max 240 characters |
| `description` | text | Optional Markdown/plain text, max 10,000 characters |
| `priority` | select | `none`, `low`, `medium`, `high`, or `urgent` |
| `rank` | number | Order within a state |
| `due_date` | date | Optional deadline |
| `assignees` | multi-relation → users | Up to 20 project participants |
| `labels` | multi-relation → board_project_labels | Up to 20 project labels |
| `documents` | multi-relation → docs | Up to 20 documents from the same project |
| `created_by` | relation → users | Set by the server on creation |

Deleting a linked document unlinks it without deleting the task. Task search results resolve document IDs to titles.

### Activity collections

`board_task_operation_logs` stores immutable `create`, `update`, `move`, and `delete` events with task/actor snapshots and field changes. Changes include linked-document title lists.

`board_project_operation_logs` stores immutable project, workflow, label, member, and `transfer_owner` events. Both collections are readable by project participants and cannot be mutated through Records APIs.

## 6. Built-in templates

Ten templates are seeded: English and Chinese variants of five workflows.

| Workflow | States | Default labels |
| --- | --- | --- |
| Software Development / 软件开发 | Todo, In Progress, Testing, Done | Bug, Feature, Design, Docs, Refactor, API, Performance |
| Simple Kanban / 简易看板 | Backlog, In Progress, Done | Blocked, Improvement |
| Content Production / 内容生产 | Ideas, Drafting, Review, Published | Article, Video, Social, Campaign |
| Issue Tracking / 问题跟踪 | Reported, Triaged, In Progress, Verification, Resolved | Bug, Incident, Regression, Security |
| Self-Media Operations / 自媒体运营 | Ideas, Creating, Scheduled, Published | Short Video, Article, Live Stream, Brand Partnership |

The Chinese variants contain localized names and descriptions. Templates are copied into project states and labels and have no runtime link to the project.

## 7. User experience

### Project creation and settings

- The creation sheet accepts a name, description, template or blank workflow, initial labels, and members.
- Project creation is transactional; the caller becomes the owner.
- Owners can edit project details, configure states, manage labels and members, inspect Project Activity, transfer ownership, and delete the project.
- Board project loading is paginated; child records are loaded only for projects on the current page.

### Kanban workflow

- Tasks are grouped by state and ordered by `rank`.
- Dragging within or across columns updates rank and, when needed, state.
- Optimistic UI updates are followed by PocketBase persistence; failures reload authoritative data.
- Task cards show priority, due date, assignees, labels, and linked-document count.
- The task sheet edits all supported fields and shows a reverse-chronological activity timeline.
- The document picker searches active project documents, and linked documents open through the unified workspace deep link.

### Realtime behavior

The Board subscribes to `board_projects`, `board_project_states`, `board_project_members`, `board_project_labels`, and `board_tasks`. Record events are applied as upserts/deletes; reconnect or failed optimistic writes trigger a reload. Task and project activity are loaded when their detail surfaces open.

## 8. HTTP and Records API surface

- `POST /api/board/projects` creates blank or templated projects transactionally.
- `PATCH /api/board/projects/{id}/owner` transfers ownership transactionally.
- Standard PocketBase Records APIs handle permitted project, state, label, member, and task CRUD.
- Server request hooks validate ownership, roles, cross-project relationships, state deletion, and activity logging.

All user-facing operations require authenticated `users` records.

## 9. Assistant tools

Read tools:

- `board_search_projects`
- `board_get_project`
- `board_search_tasks`
- `board_list_templates`

Mutation tools:

- `board_create_project`
- `board_update_project`
- `board_upsert_state`
- `board_upsert_label`
- `board_upsert_member`
- `board_create_task`
- `board_update_task`

`board_get_project` returns the caller's role and `canEditProject`, `canManageWorkflow`, `canManageMembers`, and `canEditTasks` capabilities. Existing data must be read before mutation so the assistant uses real IDs and the latest state. Task updates use patch semantics; empty arrays clear assignees, labels, or documents, and a null due date clears the deadline.

No AI deletion or ownership-transfer tool is registered. The assistant must direct users to Board for destructive actions.

## 10. Acceptance criteria

- A user can create an independent project from any seeded template or as a blank project.
- Only owners can manage settings, members, workflow, labels, and ownership.
- Admins and members can edit tasks; viewers are read-only.
- Cross-project states, labels, documents, and non-participant assignees are rejected by the server.
- The Board picker can link and unlink up to 20 active documents from the task's project; server validation rejects private and cross-project links, and deleting a document does not delete the task.
- Task and project activity accurately record successful changes and cannot be edited by clients.
- Two sessions see Board record changes through PocketBase realtime.
- Refreshing the page restores data from PocketBase rather than local storage.
- Chat can query and perform permitted non-destructive Board mutations while honoring current roles and revisions.
