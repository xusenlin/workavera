# Chat Product Requirements and Fantasy Architecture

[简体中文](./chat-fantasy-plan.zh-CN.md)

> Implementation baseline: Workavera `0.0.2`, verified against commit `3684be1` on 2026-07-13.

## 1. Purpose

Chat is Workavera's AI workspace entry point. It combines user-owned model configurations, durable conversations, streamed reasoning and tool output, and permission-aware workspace actions. A conversation can search workspace context and create or update supported records only when the user explicitly requests a mutation.

## 2. Goals

- Persist conversations and AI SDK UI-compatible message parts in PocketBase.
- Stream text, reasoning, sources, and dynamic tool states through SSE.
- Support OpenAI, OpenAI-compatible, Anthropic, and Google model configurations.
- Require an explicit user-owned model configuration for every turn.
- Continue a run when the browser disconnects and allow the client to reconnect while the process remains alive.
- Let users explicitly stop a run and show active runs across the application.
- Reconstruct multi-step tool history correctly for subsequent model calls.
- Keep provider credentials server-side and expose only safe message metadata and errors.
- Provide custom UI cards and deep links for workspace tool results.
- Keep long conversations responsive by isolating live-stream rerenders from settled historical messages and tool cards.

## 3. Non-goals

- Shared conversations or collaborative chat editing.
- Anonymous chat or server-owned model selection.
- Durable multi-instance job execution; active runs are process-local.
- Automatic retry of failed model or tool calls.
- Allowing the browser to submit authoritative conversation history.
- Unconfirmed workspace mutations.
- Destructive Board or Calendar Assistant tools.

## 4. Model configuration

Each chat turn references a record in `llm_models` owned by the caller.

- Supported protocols: `openai`, `openai-compatible`, `anthropic`, and `google`.
- Configuration includes display name, model ID, base URL, API key, optional maximum output tokens, a context window size (defaults to 256k), and default status.
- The first model created for a user becomes the default; users can choose another default.
- The prompt selects the conversation's last-used `model_config` when available, otherwise the user's default.
- Model selection is submitted with each run and updates the conversation's last-used `model_config`.
- The assistant message stores a model relation plus a metadata snapshot containing configuration ID, model ID, display name, and protocol.
- Received shared model copies record `shared_from` and cannot be shared onward; only the original author can share a configuration.
- API keys are hidden from Records APIs and are returned only as `hasApiKey` through authenticated custom endpoints.

Fantasy uses at most 12 agent steps and defaults to 16,384 output tokens unless the selected configuration provides a positive limit.

## 5. Data model

### `chat_conversations`

| Field | Type | Notes |
| --- | --- | --- |
| `owner` | relation → users | Required, cascade delete |
| `model_config` | relation → llm_models | Last model used by this conversation |
| `title` | text | Required, max 200 characters; defaults to `New conversation` |
| `status` | select | `active` or `archived` |
| `pinned` | bool | Personal pin; maximum six pinned conversations |
| `last_message_at` | date | Turn ordering timestamp |
| `message_count` | number | Cached total message count |
| `tool_call_count` | number | Cached completed dynamic tool-call count |
| `input_tokens` | number | Accumulated input usage |
| `output_tokens` | number | Accumulated output usage |
| `total_tokens` | number | Accumulated total usage |
| `context_tokens` | number | Context-window occupancy after the latest run |
| `context_summary` | text | Active compaction summary of older turns |
| `summary_until_sequence` | number | Last message sequence covered by the summary |
| `created`, `updated` | autodate | Record timestamps |

All Records API rules are owner-scoped. Users can create, rename, pin, archive, restore, and delete their own conversations.

### `chat_messages`

| Field | Type | Notes |
| --- | --- | --- |
| `conversation` | relation → chat_conversations | Required, cascade delete |
| `parent_message` | relation → chat_messages | User message associated with an assistant response |
| `sequence` | number | Unique order within the conversation |
| `role` | select | `user` or `assistant` |
| `status` | select | `pending`, `streaming`, `complete`, `error`, or `cancelled` |
| `model_config` | relation → llm_models | Model used for an assistant message |
| `parts` | JSON | AI SDK `UIMessage.parts`-compatible content, up to 4 MiB |
| `metadata` | JSON | Run, model, usage, finish reason, step count, and safe error data |
| `created`, `updated` | autodate | Record timestamps |

Messages are readable only through their owner-scoped conversation. Client Records API writes are disabled; the Chat service creates and checkpoints messages.

## 6. Stream and persistence architecture

```text
Fantasy callbacks
  -> internal/agent adapter
  -> AI SDK UI Message Stream v1 chunks
     -> in-memory run history -> SSE subscribers
     -> reducer -> chat_messages parts/metadata snapshots
```

Supported stream parts include lifecycle, step, text, reasoning, tool input/output, source URL/document, data (`data-compaction`), and message metadata events. Application tools are dynamic tools because their definitions live on the Go server.

Important protocol rules:

- Invalid wire chunks and empty deltas are dropped before SSE serialization.
- JSON `null` remains valid tool input/output.
- `step-start` markers are persisted so multi-step assistant/tool history can be reconstructed.
- Provider metadata on reasoning and tool parts is retained, including Anthropic thinking signatures.
- The browser sends only the new user message; trusted history is loaded from PocketBase.
- Model context contains every complete message after the conversation's summary boundary, prefixed by the active compaction summary as a synthetic user message.
- When the previous run exceeded 75% of the model's context window, the next run first compacts older turns into the summary with the same model (keeping the newest four user turns verbatim) and emits a `data-compaction` part; stored messages are never modified.
- User and assistant records are created transactionally before the model starts.
- Streaming snapshots are saved on significant part changes and when a later chunk arrives after the one-second checkpoint interval.
- Successful completion stores final parts and metadata, then updates conversation usage counters and the context-size snapshot (final-step usage with provider-correct cache accounting).
- When a provider reports no input usage at all, the context snapshot falls back to a character-based estimate of the sent history and produced parts, flagged as estimated so the UI renders it with a `~` prefix.

## 7. Run lifecycle and recovery

- The client supplies a UUID `runId`; the server creates one when omitted.
- Only one active run is allowed per conversation, and duplicate run IDs are rejected.
- A run uses a background context with a ten-minute timeout, independent of the initiating HTTP request.
- Disconnecting an SSE client leaves the run active. `GET /api/chat/runs/{id}/stream` replays buffered chunks and follows new ones.
- The UI reloads persisted messages and resumes a message whose metadata has a `runId` and status `streaming`.
- `POST /api/chat/runs/{id}/stop` cancels the owned run and persists the assistant message as `cancelled`.
- Process termination cancels every in-memory run.
- On startup, remaining `streaming` messages are marked `error` with `run_interrupted`.
- Provider failures, timeouts, and panics expose stable safe messages to clients while detailed diagnostics remain in server logs.

Run resumption is guaranteed only within the same live server process. A multi-instance deployment requires a durable queue, shared event log, and lease/ownership mechanism.

## 8. API surface

Conversation CRUD uses PocketBase Records APIs for `chat_conversations`.

Custom authenticated endpoints:

- `GET /api/chat/conversations/{id}/messages`
- `POST /api/chat/stream`
- `GET /api/chat/runs/{id}/stream`
- `POST /api/chat/runs/{id}/stop`

`POST /api/chat/stream` accepts:

```json
{
  "runId": "client-generated UUID",
  "conversationId": "conversation record ID",
  "modelConfigId": "owned llm_models record ID",
  "message": {
    "id": "client message ID",
    "role": "user",
    "parts": [{ "type": "text", "text": "hello" }]
  }
}
```

The service requires a non-empty user text part and validates ownership of both conversation and model. Stream responses use `text/event-stream` and `X-Vercel-AI-UI-Message-Stream: v1`.

## 9. Assistant tools

The actor-scoped production registry contains:

- Contacts: safe contact search.
- Board: project/task/template reads and permission-aware project, workflow, label, member, and task mutations.
- Calendar: schedule lookup plus event creation and update.
- Reading: search, get, upsert, and summarize.
- Docs: search, get, optimistic-concurrency upsert, exact-text replace, and chunked writes for long content (Markdown or self-contained HTML documents).

Board task search accepts a title/description keyword without requiring a
project ID. It searches active projects visible to the current user and returns
each match with its task ID, project, and complete state; callers can still
scope by project, state, or assignee and explicitly include archived projects.

Tool descriptions require explicit mutation intent, real IDs from prior reads, current revisions where applicable, and sequential writes to the same resource. Supported mutation tools accept one to 50 records through a required `items` array and return ordered per-record results; a failed record does not discard successful siblings. The array contract applies to Board state/label/member/task create and task update, Calendar event create/update, Reading upsert, and Docs move. Legacy top-level single-record inputs are not accepted.

Tool outputs render in module-specific UI cards and can open records through unified workspace deep links. Batch outputs share a summary contract with total, succeeded, and failed counts plus ordered record details. Persisted pre-batch outputs remain displayable as history, but are not valid inputs for new executions. Mock tools are excluded from the production registry.

## 10. Frontend experience

- The conversation directory is paginated at 20 active conversations per page and separates pinned from recent items.
- Users can create, rename, pin/unpin, archive, restore, and delete conversations; archived results are paginated separately.
- The active conversation is addressed by the shared `record` query parameter.
- AI SDK `Chat`/`useChat` owns live message state; Zustand owns the conversation directory.
- The message renderer supports Markdown, code, reasoning, tool states, custom result cards, model attribution, and safe errors.
- Historical message rows and settled tool cards are memoized. During a stream, only the active assistant response rerenders unless surrounding run or approval state changes.
- Tool cards are collapsed by default in running, successful, failed, and approval states. Collapsed card bodies are not mounted, while expanding a batch card shows its input count and per-record outcomes.
- Board task result cards top-align workflow lanes and cap each lane at 32 rem with independent vertical scrolling. The lane strip remains horizontally scrollable when the pointer is over a lane, while its horizontal and vertical scrollbars stay visually hidden.
- Sending is disabled until a model exists and is selected.
- A global run monitor subscribes to streaming assistant messages and lets users open or stop runs from other conversations.

## 11. Acceptance criteria

- Conversations, messages, tool results, model snapshots, and usage survive refreshes.
- A user cannot read another user's conversations, messages, models, or runs.
- Text, reasoning, tools, sources, metadata, errors, and cancellation produce valid AI SDK UI parts.
- Multi-step tool history can be sent back to all supported providers without losing required metadata.
- Disconnecting and reconnecting within the same server process resumes the active stream.
- Explicit stop, timeout, provider failure, panic, and server restart reach a terminal persisted status.
- Only one run can modify a conversation at a time.
- Workspace mutations occur only after explicit user intent and successful permission-aware tool execution.
- A task keyword can resolve the matching task ID, project, and state without
  first knowing or enumerating project IDs.
- Pinned limits, archive flows, deep links, and the active-run monitor behave consistently across refreshes.
- A persisted conversation containing hundreds of tool calls can refresh and replay without mounting every card body, and a new stream does not rerender settled historical messages.
- A valid one-item batch behaves like a single mutation; mixed-success batches preserve successes, identify failed indexes, and render accurate totals.
