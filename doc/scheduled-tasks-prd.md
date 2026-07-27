# Scheduled Tasks Product Requirements Document

[简体中文](./scheduled-tasks-prd.zh-CN.md)

> Product baseline: Workavera `0.0.9`. Status: **proposal, pending review**.

## 1. Purpose

A scheduled task is a saved prompt and a cadence. At the appointed time the assistant runs it unattended, using the owner's own tools and permissions.

It covers work that is impossible today: a morning brief of due tasks, calendar, and unread reading; a weekly review of what moved on the board; and, now that MCP servers can be connected, pulling from an external service on a schedule and turning the result into workspace records.

## 2. Goals

- Let a user define a repeating assistant run from a prompt and a cadence.
- Keep the workspace's permission guarantees intact where no human is present to approve anything.
- Make every run reviewable, every failure visible, and the cost bounded.
- Replace the ad-hoc tool-set methods with a single declarative source of exposure.

## 3. Non-goals

- A general automation platform (triggers, branching, cross-app orchestration).
- Letting a scheduled run change its own schedule or create new tasks.
- Arbitrary cron expressions in the first release.
- Destructive operations in an unattended run.
- Recurring board tasks — that is a separate deterministic feature and does not belong here.

## 4. Architecture: how tool sets are composed

This is the core of the proposal; everything else rests on it.

### 4.1 The current shape and what is wrong with it

Tool sets come from two hand-composed methods:

```go
func (f *Factory) ForActor(actorID string) []fantasy.AgentTool  // 29 built-in tools
func (f *Factory) ForChat(scope ToolScope) []fantasy.AgentTool  // ForActor + memory + MCP remote
```

Scheduled tasks add a third surface, and the three differ along axes that are independent of each other:

| Surface | Built-in | Memory | MCP remote | Destructive | Notify |
| --- | --- | --- | --- | --- | --- |
| Chat | ✅ | when enabled | ✅ | ✅ (interactive approval) | ❌ |
| API key (`/api/mcp`) | ✅ | ❌ | ❌ | per key scope | ❌ |
| Scheduled | ✅ | ❌ | ✅ | ❌ | ✅ |

Adding a third method reshapes the problem rather than solving it. Two defects matter:

**Exposure is implicit.** Adding a tool to `ForActor` ships it to Chat *and* to third-party API keys, and the author states nothing. That is a default that silently widens the attack surface.

**Destructiveness lives away from the tool.** `IsDestructive` reads a hardcoded list:

```go
var destructiveTools = map[string]bool{
	"board_delete_task":     true,
	"calendar_delete_event": true,
}
```

Add a deleting tool and forget the list, and a key with `allow_destructive` false can call it. Nothing binds the list to what it describes.

### 4.2 Proposal: each tool declares its own exposure

Move composition from code in a method body to a declaration beside the tool.

```go
// Surface is an outlet a tool may appear on. A bitmask keeps a tool's
// exposure in one declaration instead of spread across several builders.
type Surface uint8

const (
	SurfaceChat Surface = 1 << iota
	SurfaceAPIKey
	SurfaceScheduled
)

// toolSpec binds a tool to its exposure policy. A new tool must state its
// surfaces or it appears nowhere: the default is no exposure, not full.
type toolSpec struct {
	name        string
	surfaces    Surface
	destructive bool
	build       func(core.App, ToolScope) fantasy.AgentTool
}

var specs = []toolSpec{
	{name: "board_search_tasks", surfaces: SurfaceChat | SurfaceAPIKey | SurfaceScheduled,
		build: func(app core.App, s ToolScope) fantasy.AgentTool { return newBoardSearchTasksTool(app, s.ActorID) }},

	{name: "board_delete_task", surfaces: SurfaceChat | SurfaceAPIKey, destructive: true,
		build: func(app core.App, s ToolScope) fantasy.AgentTool { return newBoardDeleteTaskTool(app, s.ActorID) }},

	{name: "system_memory_upsert", surfaces: SurfaceChat, /* still preference-gated */ ...},
	{name: "system_notify_user", surfaces: SurfaceScheduled, ...},
}
```

The three surfaces become thin wrappers over one function:

```go
func (f *Factory) For(surface Surface, scope ToolScope) []fantasy.AgentTool
```

### 4.3 What this fixes

- **Exposure becomes a required decision.** A tool without `surfaces` appears nowhere. Closed-by-default becomes a fact rather than a review habit.
- **Destructiveness sits on the same line as the constructor.** `IsDestructive` reads the table, and the separate list that could drift is gone.
- **The matrix can be pinned by a test.** One test asserts the full tool-by-surface matrix, so adding a tool without classifying it fails and names the omission. That is a much stronger guard than today's count check.
- **A new surface is a column, not another method.** If a fourth outlet appears — a public share link, a webhook — the work is deciding one bit per tool.

### 4.4 Dynamic tool groups

Memory tools and MCP remote tools are not statically constructed: the first depends on a user preference, the second on how many servers the user configured. They use the same exposure declaration through a provider:

```go
type toolProvider struct {
	surfaces Surface
	build    func(core.App, ToolScope) []fantasy.AgentTool
}

var providers = []toolProvider{
	{surfaces: SurfaceChat, build: memoryTools},                                 // preference-gated
	{surfaces: SurfaceChat | SurfaceScheduled, build: mcpclient.ToolsForScope},  // remote tools
}
```

The point is that **"may this appear on this surface" and "should it appear this time" are different questions**: the first is answered statically by `surfaces`, the second at run time by `build`. Memory tools cannot leak into a scheduled run just because the preference is on.

### 4.5 Migration path

This is a pure refactor and can land and be verified before scheduled tasks exist:

1. Introduce `Surface`, `toolSpec`, and the `specs` table; make `ForActor` and `ForChat` wrappers over `For(SurfaceAPIKey, …)` and `For(SurfaceChat, …)` with identical behaviour.
2. Convert the existing count and name-list tests into matrix assertions.
3. Make `IsDestructive` read the table and delete the hardcoded map.
4. Only then add `SurfaceScheduled`.

## 5. Approval without a human

Workavera's safety model rests on interactive approval: `RequireApproval` blocks until a person decides. A scheduled run has no person.

The `/api/mcp` path sidesteps this with `WithAutoApprove`, justified because the key's scope is the pre-authorization. **A scheduled task carries no such pre-authorization**: the user approved "run this prompt daily", not "approve whatever it later decides to delete".

Therefore scheduled runs **do not receive destructive tools** (the `SurfaceScheduled` bit is simply absent from them) and **do not use `WithAutoApprove`**. If some tool still calls `RequireApproval` in a scheduled run, `ErrApprovalUnavailable` fails that call, which is the correct way to fail.

Non-destructive writes — creating tasks, writing documents — are allowed, gated by the task's own write switch.

## 6. Data model

`scheduled_tasks`, private to its owner:

| Field | Type | Notes |
| --- | --- | --- |
| `owner` | relation → users | Required, cascade delete |
| `name` | text | Display name |
| `prompt` | text | Sent to the assistant each run, maximum 4000 characters |
| `cadence` | select | `daily`, `weekdays`, `weekly`, `monthly` |
| `run_at` | text | `HH:MM`, read in the system timezone |
| `weekday` / `day_of_month` | number | For `weekly` and `monthly` |
| `allow_writes` | bool | When off, only read-only tools are offered |
| `output` | select | `notification`, `document`, `append` |
| `output_document` | relation → docs | Target for `append` |
| `enabled` | bool | |
| `last_run_at` / `last_status` / `last_error` | | Result of the most recent run |
| `consecutive_failures` | number | Auto-disables at the threshold |

At most 10 tasks per account.

## 7. Execution

Reuse the existing `app.Cron()` loop ([notifications/scheduler.go](../internal/notifications/scheduler.go) already runs at `*/6 * * * *`) and check for due tasks inside it. **No second cron job** — multiple schedulers only make failures harder to trace. The timezone comes from `configs.SystemLocation`.

Each run:

1. Creates a conversation titled with the task name and date.
2. Assembles tools for `SurfaceScheduled`, narrowed further by `allow_writes`.
3. Executes with a lower step ceiling than an interactive run.
4. Keeps the conversation, including every tool call.

The conversation is the primary artefact: the Chat interface already renders board, calendar, and reading results as cards, so nothing needs rebuilding for scheduled output.

## 8. The notify tool

A new `system_notify_user` appears **only on `SurfaceScheduled`**. In interactive Chat the model is already speaking to the user, so a "send a message" tool would be redundant.

Its justification is not that the model needs an outlet — a run's final text could serve as the notification body. It is that **the model must be able to choose silence**. "Tell me only when something is overdue" sent automatically becomes a daily "nothing overdue", muted within a week, and then missed on the day it mattered. **No call, no interruption.**

Input: `title`, `body`, `urgent`. The server forces the recipient to the task owner, the type to `scheduled_task`, and writes the run's conversation ID into `data`.

The notification itself is a headline and a link; rich content stays in the conversation, which already renders it. The 4000-character cap on `notifications.body` reflects the same intent.

`notifications.type` is currently a fixed enum (`model_share`, `task_due`, `calendar_event`), so a migration adds `scheduled_task`.

## 9. Output destination

| Cadence | Recommendation | Reason |
| --- | --- | --- |
| Daily | Notification only | 365 documents a year is clutter; the conversation is already reviewable |
| Weekly / monthly | Append to a rolling document | You do look back, compare, and share these |

Appending beats creating: one growing "Weekly reviews" document is easier to find than 52 scattered files. It reuses `docs_write_chunk`.

## 10. Cost and failure

- Every run spends the owner's own model quota. Cap tasks per account and steps per run.
- An unavailable model or a retired MCP endpoint are ordinary events. Auto-disable at a consecutive-failure threshold and notify — **a scheduled task that fails silently is worse than none**.
- Bound each run's total duration; a timeout counts as a failure.

## 11. Trust boundary

A scheduled run can read output from remote MCP tools, which is untrusted content. A malicious server could try to have the model emit a notification that reads like a system alert.

The interface therefore **must attribute a notification to the specific scheduled task** and never present it as a system notification. The Chat system prompt's rules about external content apply to scheduled runs unchanged.

## 12. Acceptance criteria

- A tool's exposure is decided by declaration; an unclassified new tool appears on no surface and fails the test.
- `IsDestructive` derives from the tool declaration, with no separate list.
- Scheduled runs contain no destructive tools and never use `WithAutoApprove`.
- Memory tools never appear in a scheduled run, whatever the user's preference.
- Each run produces one complete, reviewable conversation.
- A run that does not call the notify tool produces no notification.
- A task reaching the failure threshold is disabled and its owner notified.
- Notifications from scheduled tasks are distinguishable from system notifications.
- A user cannot read or modify another user's scheduled tasks.
