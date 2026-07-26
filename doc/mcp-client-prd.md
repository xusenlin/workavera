# MCP Client Integration Product Requirements Document

[简体中文](./mcp-client-prd.zh-CN.md)

> Product baseline: Workavera `0.0.9`.

## 1. Purpose

MCP Client Integration lets each user connect their own third-party Model Context Protocol servers to Workavera and use those servers' tools inside Chat, alongside the built-in Board, Calendar, Docs, Reading, and Contacts tools.

Workavera already acts as an MCP *server* at `/api/mcp`, exposing workspace capabilities to clients such as Claude Code and Cursor. This feature is the opposite direction: Workavera acts as an MCP *client* so the in-app assistant can reach capabilities Workavera does not implement itself.

## 2. Goals

- Let a user register their own MCP servers and use their tools in Chat.
- Keep tool definitions stable and reviewable: the assistant only ever sees definitions the user has explicitly accepted.
- Let the user decide, per tool, whether it is available at all and whether each call requires approval.
- Add no background daemon, no persistent upstream connections, and no new infrastructure.
- Keep the workspace's own permission guarantees intact by keeping remote tools out of every non-Chat surface.
- Make failures legible: distinguish an upstream server's ordinary errors from a tool definition that has drifted out of date.

## 3. Non-goals

- Sharing an MCP server configuration between users.
- The `stdio` transport and any form of local process spawning.
- Re-exporting a user's remote tools through Workavera's own `/api/mcp` endpoint.
- Live mirroring of an upstream tool list, including acting on `notifications/tools/list_changed`.
- MCP resources, prompts, sampling, elicitation, and roots.
- OAuth authorization flows against upstream servers in this release.
- Connection pooling or reuse across tool calls.

## 4. Integration model

The integration rests on two independent decisions.

**Locked definitions.** A server's tool definitions are a snapshot stored in Workavera's database, not a live view of the upstream server. The snapshot is written only when the user refreshes the server and accepts what changed. Upstream may add, remove, or redefine tools at any time; nothing reaches the assistant until the user accepts it. This is the same contract as a dependency lockfile.

**Lazy connection.** Workavera holds no open connection to any upstream server. A connection is established when a tool is actually called, and closed when that call completes.

The two combine into a system with no background state:

| Moment | Network activity |
| --- | --- |
| Chat run starts, tools assembled | None; definitions are read from the database |
| Assistant calls a remote tool | `initialize` → `tools/call` → close |
| User clicks Refresh | `initialize` → `tools/list` → close |
| Any other time | None |

Because tool assembly performs no network I/O, an unreachable upstream server can never delay a Chat run's first token or prevent the built-in workspace tools from working.

## 5. Server data

Each server is one `mcp_servers` record, private to its owner.

| Field | Type | Notes |
| --- | --- | --- |
| `owner` | relation → users | Required, cascade delete |
| `name` | text | Display name, required, maximum 100 characters |
| `slug` | text | Tool-name prefix, `^[a-z][a-z0-9_]{0,19}$`, unique per owner |
| `transport` | select | `http` (Streamable HTTP) or `sse` |
| `url` | text | Upstream endpoint, required, `http`/`https` only |
| `headers` | json | Hidden; request headers carrying the user's credentials |
| `enabled` | bool | Whether the server contributes tools to Chat |
| `tools` | json | The locked tool definitions, see below |
| `last_error` | text | Most recent connection or refresh failure |
| `last_refreshed` | date | When the definitions were last accepted |
| `created`, `updated` | autodate | Record timestamps |

An MCP server configuration is personal, not administrative. `headers` typically holds the user's own bearer token for the upstream service, so a server is never shared, transferred, or exposed to another account — including to superusers through the application UI. Deleting a user deletes their servers.

Each account may register at most 10 servers.

## 6. Tool definitions

`tools` is an array of locked definitions:

| Key | Notes |
| --- | --- |
| `name` | Upstream tool name |
| `description` | Upstream description, as accepted by the user |
| `parameters` | Input-schema `properties`, with `$ref`/`$defs` already resolved |
| `required` | Input-schema `required` list |
| `enabled` | Whether the tool is offered to the assistant |
| `approval` | `always` or `never` |
| `hash` | Digest of description plus schema, used for drift detection |
| `stale` | Set when a call indicated the definition no longer matches upstream |

Fantasy rebuilds every tool schema as `{type, properties, required}` and does not resolve JSON Schema references, so `$defs` and `$ref` are inlined at refresh time. A tool whose schema cannot be resolved within a bounded depth is not stored, and the refresh result reports it as unsupported.

Each account may lock at most 100 enabled tools in total, keeping the injected tool list bounded.

## 7. Configuration lifecycle

**Add.** The user provides a name, slug, transport, URL, and any request headers. The record is created with no tools and is not yet usable.

**Refresh.** Workavera connects, calls `tools/list`, and reconciles the result with the stored definitions:

- a tool absent upstream is removed;
- a tool whose `hash` is unchanged keeps its `enabled` and `approval` settings;
- a new tool, or one whose description or schema changed, is stored disabled, with its approval mode pre-set from the server's approval policy, and is presented to the user as requiring review.

Refresh never silently enables anything. A tool the user has not reviewed is never offered to the assistant.

**Review.** The user sees which tools are new, changed, or removed, chooses which to enable, and sets each enabled tool's approval mode.

Refresh is the only path by which upstream content enters the assistant's context.

## 8. Tool naming

A locked tool is exposed to the assistant as `mcp_<slug>_<name>`, sanitized to `[a-zA-Z0-9_-]` and truncated to 64 characters to satisfy provider constraints on function names. The `slug` namespace prevents collisions between servers and with built-in tool names.

## 9. Approval

Approval is decided per tool at configuration time and stored in the definition. It is not read from upstream at call time.

MCP tool annotations such as `readOnlyHint` and `destructiveHint` are supplied by the upstream server and are therefore untrusted. They are used only to pre-select checkboxes during review, are labelled as server-provided, and never determine runtime behaviour.

A server-level `approval_policy` sets the default applied to newly discovered tools:

| Policy | Default for a new tool |
| --- | --- |
| `all` | `always` |
| `writes` | `always`, unless the upstream annotations suggest the tool is read-only |
| `none` | `never` |

An enabled tool with `approval=always` calls the standard Chat approval gate before contacting upstream. Because Workavera cannot resolve an upstream record into a human-readable target, the approval card shows the server name, tool name, and the exact arguments, and states that the action happens on an external service.

## 10. Call execution

A remote tool call proceeds in this order:

1. Validate the model's arguments against the locked schema.
2. Request approval when the tool requires it.
3. Connect, call `tools/call`, close.
4. Classify the outcome.

Local validation runs first so that malformed model output is rejected without a network request, and — critically — so that an upstream parameter rejection becomes evidence that the locked schema no longer matches upstream. Fantasy only checks that required keys are present, so validation against the full schema is performed by this feature.

The connection uses the Chat run's context with an added timeout, so cancelling a run also abandons the upstream request. The standalone SSE stream is disabled: Workavera does not consume server-initiated notifications.

A connection failure returns a tool error to the assistant rather than failing the run. Built-in workspace tools remain available when an upstream server is unreachable.

## 11. Outcome classification

Distinguishing a genuine upstream error from a stale definition determines whether the user is told to refresh.

| Outcome | Interpretation | Effect |
| --- | --- | --- |
| Result with `isError` | The tool ran and failed | Returned to the assistant; no marking |
| Protocol error naming an unknown tool | The tool no longer exists | Tool marked `stale` |
| Local validation failure | The model produced bad arguments | Returned to the assistant; no request sent; no marking |
| Invalid-params error after local validation passed | The locked schema disagrees with upstream | Tool marked `stale` |
| Connection failure, timeout, or authentication rejection | Server or credential problem | Recorded in `last_error` at the server level |
| Any other protocol error | Upstream fault | Returned to the assistant; no marking |

The distinction between the last two rows matters in the interface: an expired credential and a changed tool require different actions from the user, so a server-level connection failure is never reported as a tool change.

This classification is a heuristic. MCP servers vary in which error channel they use for the same condition, so a `stale` mark is presented as "this call failed and the definition may be out of date" rather than as a confirmed change. The refresh view shows the user the actual difference and leaves the judgement to them.

## 12. Trust boundary

Tool descriptions and tool results from an upstream server are untrusted data. They enter the same model context as the built-in tools that mutate the user's workspace.

- The Chat system prompt states that content originating from an external MCP server is data, never instruction, and cannot authorize a workspace mutation.
- Remote tool results are labelled with their originating server.
- The locked-definition model is itself part of this boundary: an upstream server cannot change what the assistant believes a tool does without the user accepting the change first.

## 13. Surface boundary

Remote tools are added only to Chat runs. They are absent from the tool set used by `/api/mcp`, so an API key issued to a third-party client continues to expose exactly the workspace capabilities Workavera itself authorizes, and the key's `allow_destructive` scope keeps its precise meaning.

## 14. Settings experience

Settings contains an MCP Servers card listing each server with its connection state, enabled tool count, and any pending review or error.

Actions available per server:

- add, edit, and delete a server;
- enable or disable the server as a whole;
- refresh, which opens the review view;
- review, showing new, changed, removed, and unsupported tools, with per-tool enable and approval controls.

A server needing attention is flagged: a tool marked `stale`, or a stored `last_error`, surfaces as an indicator on the card with text describing which of the two occurred. Credentials are write-only; stored header values are never returned to the browser.

## 15. Chat experience

Remote tool calls render with the generic tool card, showing the namespaced tool name, the arguments, and the result. Approval-gated remote calls use the existing approval card, identifying the external server.

When a call marks a tool `stale`, the error returned to the assistant states that the definition may be out of date and that the user needs to refresh the server in Settings. The assistant decides how to proceed from there.

## 16. Permissions and lifecycle

- Servers and their headers are private to their owner and are never shared or transferred.
- Stored headers are never returned by any read path.
- Only refresh writes tool definitions; the client cannot submit its own.
- Enabling a tool and setting its approval mode are the only definition fields a user edits directly.
- A disabled server contributes no tools regardless of its stored definitions.
- Deleting a user deletes their servers.

## 17. Acceptance criteria

- A user can register an MCP server, refresh it, enable specific tools, and use them in Chat.
- Assembling tools for a Chat run performs no network I/O.
- An unreachable server delays no Chat run and disables no built-in tool.
- Tool definitions change only through refresh followed by user acceptance.
- A newly discovered or changed tool is disabled and requires approval until reviewed.
- A tool whose hash is unchanged keeps its enable and approval settings across refreshes.
- Upstream annotations affect only review defaults, never runtime approval.
- Arguments failing local validation produce no upstream request.
- The outcome classification marks `stale` and `last_error` exactly as tabulated, and never reports a connection failure as a tool change.
- Remote tools are absent from `/api/mcp`.
- Stored headers are never readable through any API response.
- A user cannot read or mutate another user's servers.
- No upstream connection outlives the call that opened it.
