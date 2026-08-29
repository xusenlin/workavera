# Changelog

All notable changes to Workavera are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Reading has a discovery panel behind the sparkle button in its sidebar. It
  keeps a list of subscriptions the user owns, either an RSS or Atom feed of
  their own — a site, a newsletter, or a repository's `releases.atom` — or
  GitHub's trending board for one language over a day, week, or month, which
  is where the star gain that no GitHub API reports is published. Fetching
  reads every enabled subscription at once, or whichever subset is selected,
  and shows what came back as candidates that are not stored yet: a trending
  row carries its star gain for the period, its star total, and its language.
  Any candidate can be summarized into English, Chinese, or Japanese before a
  decision, and only the ones kept become reading items, carrying the summary
  along. Anything already in the reading list is marked as such, a subscription
  that fails to load reports its error against itself and leaves the rest of
  the panel intact, and a new account starts with the Go, Rust, and TypeScript
  weekly boards plus the Hacker News front page.
- Projects can be shared publicly. The owner publishes a project from its
  options menu and gets an unguessable link that anyone can open without an
  account, optionally with an expiry date. The page shows the project, its date
  span, how many tasks sit in each state, the team by name and avatar, and a
  calendar timeline where every task runs from its start date to its due date
  and each day lists what it holds and what is already done, folding a busy day
  behind a `+3 more` once it holds more than six tasks. Unlike a shared
  document, the link reports the project as it stands, with a refresh button to
  pull the latest progress. Revoking the link, letting it expire, or archiving
  the project all make it unavailable at once, and task assignees, member
  emails, roles, and archived tasks never leave the server. A task's linked
  documents open through their own public links, and documents the author has
  not shared are named but not reachable. The project name, its counts, and the
  refresh button stay at the top of the page while the timeline scrolls, and
  adding `?lang=zh` to the link reads every date in Chinese formatting instead
  of the English default. Sharing is a share icon in the project title row that
  turns green while a link is live, and its dialog can open the link in a new
  tab and append the Chinese-date parameter for you.

### Changed

- The document share dialog can open the shared link in a new tab instead of
  only copying it.
- Tasks carry an optional start date alongside their due date, so a task is a
  span rather than a single deadline. The board task form, the Board API, and
  the `board_create_task` and `board_update_task` assistant tools all accept it,
  and a start date after the due date is refused.

### Fixed

- Picking a different item in the reading list works again. The selection was
  being restored from the address bar a moment after the click and snapped back
  to the item that was open before, which left the list stuck on one entry as
  soon as it held more than a single item.
- The navigation menu can be dismissed on a phone. It opens as a sheet that
  ignores taps outside it and hides its close button, so with no Escape key it
  could not be closed at all; tapping the dimmed area now closes it, and so
  does following any link inside it, which previously left the menu covering
  the page it had just opened.

## [0.1.0] - 2026-08-21

### Added

- Documents can be shared publicly. The creator publishes a document from its
  toolbar and gets an unguessable link that anyone can open without an account,
  optionally with an expiry date. The link serves the revision that was
  published, so editing continues privately until the creator publishes again;
  Markdown renders read-only and HTML renders in the same sandbox as the editor
  preview. Revoking a link, letting it expire, or archiving the document all
  make it unavailable at once, and only attachments the published snapshot
  references are reachable through it. A shared Markdown document reads with a
  scroll progress bar and a jumpable outline of its own headings.
- Chat shows a thinking indicator with the elapsed seconds while a run has
  produced no output yet, both before the first token and between a finished
  tool call and the next one. Self-hosted models can be slow enough that an
  idle transcript otherwise reads as a frozen page.

### Changed

- The application logo is an arced W with a floating dot and a cast shadow,
  replacing the robot mark. Both layers share one path and follow the theme
  foreground, so the mark needs no hard-coded colour in light or dark mode.

### Fixed

- The assistant knows the time of day, not just the date. The system prompt
  carried only `Current date`, which left anything expiring on a scale of
  minutes unjudgeable; it now renders the local time with its offset and zone,
  taken from the same administrator-configured system timezone the Calendar
  tools use.
- Plain `<button>` elements show a pointer cursor again. Tailwind v4's preflight
  sets `cursor: default` on buttons, and only the ones built from the Button
  component opted back in.

## [0.0.11] - 2026-08-04

### Changed

- PocketBase is updated from 0.39.4 to 0.39.10, which also brings SQLite 3.53.3
  (`modernc.org/sqlite` 1.55.0) and the `fexpr` 0.6.0 filter parser. A panic in
  a Workavera command exits with a non-zero status again: PocketBase 0.39.7 had
  turned CLI panics into a successful exit as a side effect of its worker fix,
  which hid failures from process supervisors, container restart policies, and
  CI. 0.39.10 restores the old behavior for the command path while keeping the
  worker recovery.

### Fixed

- Chat can list every personal custom Calendar event through
  `calendar_search_events` without inventing a keyword. Its `query` parameter
  is now optional, and an empty query returns all events owned by the signed-in
  user instead of failing or truncating the result.
- Calendar shows unfinished Board task deadlines assigned to the signed-in
  user again, whether they own or participate in the project. The personal
  filter now matches assignee relation IDs and excludes completed states;
  comparing the multi-select relation itself silently returned no tasks.

### Security

- An unhandled panic in an internal PocketBase worker goroutine no longer takes
  down the server. Workavera embeds PocketBase rather than running it as a
  separate binary, so such a panic ended the whole workspace process instead of
  failing one request; those workers now recover and return an error
  (PocketBase 0.39.7).
- `ozzo-validation` is replaced by the `github.com/pocketbase/ozzo-validation`
  fork, after the original module changed owners upstream and PocketBase judged
  the new maintainer untrusted. Workavera reaches the library only through
  PocketBase and imports it nowhere, so the original module is gone from
  `go.mod` and `go.sum` with no source change.

## [0.0.10] - 2026-07-30

Workavera for Android and iOS 1.0.2 need this release: their task archiving
reads a field it adds. The README carries the client compatibility table.

### Added

- Tasks in the final Board column can be archived and restored from a
  paginated project-level archive. Archived tasks keep their original state
  and rank while staying out of normal Board, dashboard, calendar, and
  assistant queries. Calendar task deadlines are also limited to tasks
  assigned to the signed-in user.

### Fixed

- A conversation no longer loses the record of an exchange to a request that
  arrived alongside it. PocketBase writes every column of a record, so the
  automatic rename that follows a first message could carry the conversation's
  message count, activity date, and model back to what they were before that
  exchange was persisted — leaving a conversation that had just been used
  undated, and last in the list. A save now keeps the stored value of any
  run-owned field it did not set out to change.
- A new conversation now appears at the top of the conversation list. A
  conversation is dated when it is created, so one that has yet to receive a
  message no longer sorts below every older conversation, or off the first
  page entirely. Conversations that were left undated are backfilled from
  their creation time, and the web list follows the server order instead of
  re-sorting the page it was given.
- `board_update_task` now rejects task patches that contain only a task ID,
  instead of reporting a successful update that could not change anything.
  Valid patches that already match the stored task return
  `action: "unchanged"` and `changed: false`, and no longer create a database
  write or activity entry.

### Changed

- Every Chat tool card now uses the same lazy, bounded parameter inspector.
  Collapsed cards show a compact field summary; expanding a parameter panel
  previews at most 12,000 characters, ten array items, four nesting levels,
  and 120 values. Large Docs HTML and document content are truncated in the
  rendered preview, while an explicit copy action still provides the complete
  persisted parameters. Board batch calls, memory actions, approvals, and
  generic or MCP tools all use the same behavior.

## [0.0.9] - 2026-07-27

### Added

- Each user can connect their own third-party MCP servers from Settings and use
  those servers' tools in Chat alongside Board, Calendar, Docs, Reading, and
  Contacts. A server is registered with an endpoint, a tool-name prefix, and
  request headers; the headers hold the user's personal upstream credentials,
  so servers are private to their owner and are never shared or readable back.
  Streamable HTTP and SSE endpoints are supported; `stdio` is not.
- Tool definitions are locked rather than mirrored. Refreshing a server fetches
  its tool list and reports what was added, changed, removed, or uses an input
  schema Workavera cannot resolve; nothing is enabled without the user choosing
  it. A tool whose definition is unchanged keeps its settings across refreshes,
  while a new or redefined one returns to disabled and needs review, so an
  upstream server cannot silently redefine a tool the user already approved.
- Each enabled tool records whether calls need approval. Upstream `readOnlyHint`
  annotations only pre-select that choice during review, and never decide it at
  call time, because the annotation comes from the server being judged.
  Approval-gated remote calls use the existing Chat approval card and name the
  external server and arguments.
- Chat can find calendar events by name through `calendar_search_events`.
  Calendar was the only module without a text search, so locating an event the
  user named meant guessing dates and scanning them with
  `calendar_get_schedule`, which answers for exact dates only. A repeating
  event made that worse, since it surfaces only on the dates its recurrence
  lands on. Search returns whole events with their IDs and repeat rules, so a
  monthly reminder is found regardless of when it next occurs.
- Chat can create a personal document folder through `docs_ensure_folder`,
  which resolves a folder by name and only creates one when no folder of that
  name exists. Previously the assistant could list folders but not create
  them, so asking it to file a document under a new folder always failed.
  Matching ignores case and the call is idempotent, so a repeated request
  never leaves duplicates behind.
- Every account starts with Hugging Face, DeepWiki, and Exa Search already
  listed, so the feature is not an empty screen. The presets need no
  credentials and arrive disabled with no tool definitions, so they reach Chat
  only after the same refresh-and-review step as any other server. Settings
  lists each server's enabled tools inline, marking the ones that ask for
  approval before running.
- Failed calls distinguish an upstream error from a definition that has drifted.
  Arguments are validated against the locked schema before any request, so a
  parameter rejection from upstream means the definition no longer matches and
  the tool is flagged for refresh, while connection and credential failures are
  reported against the server instead. See `doc/mcp-client-prd.md`.
- Account owners can retire their own account through deactivation instead of a
  hard delete. A new `deactivated` flag on the users record, settable via the
  existing self-update rule, retires the account without cascade-deleting the
  projects, tasks, documents, calendar events, and chat history it owns, or
  orphaning shared team data such as task assignees and document authorship.
  This backs the in-app "Delete account" flow required for mobile app stores.

### Fixed

- Chat tool-approval cards now open on their own while a decision is pending.
  The approve and reject buttons sit in the card's collapsed region, so a run
  waiting on approval appeared to stall with no visible way to act on it. The
  card follows the approval state instead of a fixed initial value, so a run
  that reattaches after a reload also opens its pending card, and collapsing it
  by hand still sticks.
- Dialogs and sheets no longer close when a click lands outside them; Escape and
  the close button remain. Radix renders dropdown content in its own portal, so
  opening a select inside a dialog counted as an outside click and dismissed the
  whole dialog, discarding anything typed into it.

### Changed

- Deactivated accounts can no longer authenticate: password and refresh auth
  requests are rejected, and deactivating rotates the account's token key so
  any already-issued sessions stop working immediately. Only a superuser can
  clear the flag; physically purging a deactivated account remains an
  administrator task.

## [0.0.8] - 2026-07-19

### Added

- Board project owners can archive projects from the project menu and manage
  accessible archived projects in a paginated dialog. Owners can restore a
  project with its existing order preference or permanently delete it;
  archive and restore changes are recorded in Project Activity and are not
  exposed as Assistant mutations.
- Docs now organizes private documents with one-level personal folders,
  managed from the Locations pane and sorted by name. Folders are exclusive
  to their owner; deleting a folder returns its documents to My documents
  without deleting them or creating versions.
- Board project headers and the task sheet have a copy button that places a
  `Projects:{id}:{name}` or `Task:{id}:{title}` reference on the clipboard,
  ready to paste into Chat so the Assistant can target the exact record.
- Chat now supports private, cross-conversation long-term memory under explicit
  user control. Memory is off by default; users can enable saved-memory use and
  separately opt in to automatic capture from Settings.
- Settings includes a memory manager for creating, searching, filtering,
  editing, activating, deactivating, and deleting memories. Each user can keep
  up to 50 concise memories across preference, personal, work, goal, and
  constraint categories.
- Authenticated Chat runs can use the internal `system_memory_upsert` and
  `system_memory_forget` tools. The server enforces ownership, capture consent,
  content policy, limits, and trusted conversation/message provenance; memory
  tools are not exposed through MCP.
- Dedicated Chat cards show explicit saves, automatic saves, unchanged
  memories, and forgotten memories. Created or updated memories can be undone;
  the server atomically reverts the memory and persists the original card as
  undone without overwriting a memory changed later.

### Changed

- Document creators can now move documents between My documents, personal
  folders, and editable projects. Moving a document out of a project
  atomically unlinks it from that project's tasks without changing its content
  revision.
- Task result cards cap each workflow-state lane at 32 rem with independent
  vertical scrolling and top-aligned columns, preventing one large state from
  stretching shorter states into a long empty area. Horizontal trackpad or
  wheel gestures continue to scroll the state lanes even while the pointer is
  over a lane, and both horizontal and vertical scrollbars are visually hidden.
- `board_search_tasks` can now search task titles and descriptions by keyword
  across all active projects visible to the current user without requiring a
  project ID. Results are limited to 20 by default (maximum 50) and embed each
  task's project and complete state; project-scoped state/assignee filtering
  and full task listing remain available.
- Chat now memoizes historical messages and settled tool cards so streaming
  updates rerender only the active assistant response. Every tool card starts
  collapsed, and collapsed details are unmounted rather than merely hidden,
  keeping long conversations responsive during streaming and refresh replay.
- Board state, label, member, task-create, and task-update mutations; Calendar
  event create/update; Reading upsert; and Docs move now accept a required
  `items` array with one to 50 records. A one-record mutation uses a one-item
  array; legacy top-level single-record inputs are no longer accepted.
- Batch mutations execute records sequentially with per-record success or
  failure results, continue after individual failures, and render as one Chat
  card with total, succeeded, and failed counts plus expandable record details.
  Previously stored single-record tool results remain readable in history.
- Each Chat run receives the complete active saved-memory set as the
  authoritative current state. Historical memory tool calls remain visible as
  past events, while current user messages and the current saved-memory set
  take precedence over stale history.
- Chat system context no longer includes the user's appearance preference;
  visual theme remains a UI-only preference.
- Memory action cards place Undo and Manage controls at the lower right with a
  dedicated undo icon, and memory source links use a compact Chat icon.
- The task sheet focuses the title input when it opens, so a new task's title
  can be typed immediately.
- Requests to model providers now identify their source as Workavera instead of
  the underlying Fantasy SDK.
- Account-level appearance and memory controls now live together in a private
  user-preferences record. Existing themes are migrated without changing the
  user's selection, and new accounts default to the system theme with memory
  fully disabled.

## [0.0.7] - 2026-07-17

### Added

- Workavera now exposes its assistant tools to third-party MCP clients such
  as Claude Code and Cursor through a Streamable HTTP endpoint at `/api/mcp`,
  authenticated with per-user `sk-wa-` API keys. The server advertises
  scope-aware usage instructions to connecting clients during initialization.
- API keys can be created from Settings with an optional expiration and a
  clearly marked opt-in for destructive operations; keys without that scope
  never see the delete tools, while scoped keys run them without interactive
  approval. The full key is shown once at creation together with a
  copy-paste-ready MCP client configuration, and keys can be revoked at any
  time by deleting them. Only a SHA-256 hash of the key is stored.
- Destructive assistant tools can now pause a running chat for explicit user
  approval, stream a reusable approval card to the frontend, and resume after
  the user approves or rejects the request. Rejections are recorded in the
  conversation without executing the tool.
- The `board_delete_task` and `calendar_delete_event` tools now require this
  approval before deleting data; approval cards show the affected item and
  warn when deleting a recurring calendar series.
- Notifications can now be searched and filtered by read state and type, with
  pinning, paginated active and archived lists, restore, and permanent delete.
- Reading now has server-side search, status and project filters, a mark-all-read
  action, paginated active and archived lists, restore, and permanent delete.

### Changed

- Document lists now return metadata only and fetch full content when a
  document is selected, reducing duplicate transfers for large HTML documents.
- Notifications and Reading use PocketBase collection list and CRUD APIs for
  their standard record operations; only domain workflows such as bulk-read,
  model-share responses, and article summarization keep custom endpoints.
- Reading list previews show the description when present, otherwise the
  summary, and clamp the preview to two lines.
- The Chat conversation list now shows a realtime Responding indicator for
  every conversation with an active assistant response stream, including
  background conversations.
- Model settings now use shared output and context token-size controls with
  compact `k` and `M` values, presets, and custom-size support.

### Fixed

- HTML document previews now keep anchor links inside the rendered document
  instead of navigating the sandboxed frame to an empty application page.
- Notification items in the bell dropdown no longer show the browser's gray
  focus outline when the popover opens; keyboard focus uses a subtle background.
- Internal one-shot text generation now uses the provider's streaming transport,
  avoiding providers that reject non-streaming requests with large output limits
  before the typically shorter response is generated.

### Removed

- **The deprecated `ai_micro_apps` collection and every remaining AI Micro
  Apps record and file are permanently deleted by migration**, completing the
  removal announced in 0.0.6. If you still need any of that data, export it
  from the PocketBase admin UI **before** upgrading to this version — after
  the migration runs there is no way to recover it.

## [0.0.6] - 2026-07-17

### ⚠️ Breaking: AI Micro Apps module removed

The AI Micro Apps module has been absorbed into Docs and its UI, API routes
(`/api/ai-micro-apps/*`), and AI tools (`microapps_*`) no longer exist.

**Your data is NOT deleted in this release.** The `ai_micro_apps` collection
and its stored HTML files remain in `pb_data/` as a one-version recovery
buffer, but they are no longer reachable from the app. To keep an app, open
the PocketBase admin UI (`/_/`), browse the `ai_micro_apps` collection, and
download each record's `html_file` — then re-create it as an HTML document in
Docs (paste the source in the HTML source view) or keep the file.

**The collection and all remaining data will be permanently deleted in
0.0.7.** Export anything you care about before upgrading past this version.

### Added

- Fresh installations now seed a verified demo application user
  (`demo@workavera.local` / `workavera`) when the `users` collection is empty,
  so Workavera can be opened without first creating a user in PocketBase Admin.
- Docs now have a kind: `markdown` (default) or `html`. HTML documents hold a
  self-contained interactive page rendered in a sandboxed preview (scripts run
  in an opaque origin with no access to your session), with source editing,
  raw `.html` export, versions, project sharing, pins, and conflict detection.
- New `docs_write_chunk` AI tool writes long content in pieces (Markdown or
  HTML); a whole chunked session records a single version.
- The docs list, board document links, and chat tool cards mark HTML documents
  with a code icon, and chat tool cards show a sandboxed live preview.

### Changed

- AI document creation now requires an explicit Markdown or HTML kind. If the
  user has not chosen one, the Docs tool instructs the Assistant to ask whether
  they prefer simple, easily editable Markdown or rich, interactive HTML.
- `docs_upsert` accepts a `kind` when creating; the kind of an existing
  document never changes, and content edits are validated against the stored
  kind server-side.
- The chat assistant now registers 24 tools instead of 30; the seven
  `microapps_*` tools were replaced by the extended docs tools.
- The context ring hover was reworked: it now shows cache hit/write, the
  compaction threshold ("Compacts at"), and the conversation's accumulated
  input/output totals, replacing the misleading final-step input/output split.

### Fixed

- When a provider reports no input usage (e.g. GLM's Anthropic-compatible
  endpoint always returns `input_tokens: 0`), the context size now falls back
  to a character-based estimate instead of a meaningless tiny number, so the
  ring stays truthful and automatic compaction still triggers. Estimated
  values are marked with a `~` prefix, and unreported cache/input details
  render as `~` instead of hiding or showing a fake `0`.

## [0.0.5] - 2026-07-16

### Added

- Model configurations have a context window size ("Max context") with common presets from 32k to 2M or a custom value (`300k`, `1.5m`, or a plain number); existing models are migrated to 256k.
- Conversations automatically compact older turns into a running summary when the previous run exceeds 75% of the model's context window, keeping the newest four user turns verbatim. The stored chat history is never modified, and the transcript marks where compaction happened.
- The chat input shows a context-usage ring next to the model selector; hovering reveals the current context size and input, output, reasoning, cache-hit, and cache-write token details.

### Changed

- The fixed chat history window (last 30 messages / 15 user turns) was removed. The model now receives the full conversation—or the summary plus recent turns after compaction—so provider prompt caches stay warm across turns instead of missing on every turn once the window slid.
- Assistant message metadata and conversation stats record the context size of the latest run, measured from the final step's usage with provider-correct cache accounting.
- Upgraded Fantasy to 0.37.3 and Go to 1.26.5.

## [0.0.4] - 2026-07-15

### Added

- Notion-style document editing: slash commands, drag handles with a "Turn into" menu, and a floating formatting toolbar.
- Documents support access-controlled image and file uploads, duplicate reuse, and persistent attachment cards; uploaded images are embedded in HTML exports.
- Documents can be exported as Markdown or standalone HTML files.
- Board projects can be reordered with per-user up/down controls; ordering is preserved across pagination and does not affect other members.
- Each user's expanded or collapsed Board project state is persisted independently, with multiple projects allowed to remain open.

### Changed

- `task release` now includes an Intel macOS (`darwin/amd64`) archive.
- The document editor is now BlockNote-based (replacing Milkdown); documents are still stored and versioned as Markdown.
- Document header actions (source view, fullscreen, export, history, save, move to project) are now icon buttons; the draft diff view was removed.
- Code blocks in documents follow the app light/dark theme.

## [0.0.3] - 2026-07-14

### Added

- Frontend assets are embedded into the Go binary (`go:embed`), so a release is a single self-contained executable with no separate asset files.
- `task release` packages compressed release archives (`.tar.gz`/`.zip`) for Linux, macOS, and Windows with a `SHA256SUMS.txt` checksum file.
- Apache License 2.0, `NOTICE` file, and license badge.

### Changed

- Frontend bundle size cut from 28 MB to 11 MB.

### Fixed

- Board state `sortOrder` is now exposed to AI tools, so AI-created workflows keep their intended column order.

## [0.0.2] - 2026-07-13

### Added

- Board tasks can link documents from the same project.
- Appearance (theme) is now a per-user preference.

### Fixed

- Received model copies can no longer be re-shared.

## [0.0.1] - 2026-07-13

First public release.

### Added

- **Chat** with streaming model output, reasoning, resumable background runs, and permission-aware tool calls into the modules below.
- **Board** with independent project workflows, labels, roles, tasks, activity history, bilingual templates, and AI mutation tools.
- **Docs** with Milkdown Markdown editing, explicit versions, conflict detection, and AI editing tools.
- **Calendar** with personal events, recurrence, Board deadline overlay, and in-app reminders.
- **Reading** library for external URLs with AI summaries in a configurable language.
- **Contacts** with favorites and a bounded, non-sensitive projection for Chat search.
- **AI Micro Apps** for self-contained HTML tools with sandboxed preview.
- **Dashboard**, realtime **Notifications**, and **Settings** with per-user model configurations and model sharing.

[Unreleased]: https://github.com/xusenlin/workavera/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/xusenlin/workavera/compare/v0.0.11...v0.1.0
[0.0.11]: https://github.com/xusenlin/workavera/compare/v0.0.10...v0.0.11
[0.0.10]: https://github.com/xusenlin/workavera/compare/v0.0.9...v0.0.10
[0.0.9]: https://github.com/xusenlin/workavera/compare/v0.0.8...v0.0.9
[0.0.8]: https://github.com/xusenlin/workavera/compare/v0.0.7...v0.0.8
[0.0.7]: https://github.com/xusenlin/workavera/compare/v0.0.6...v0.0.7
[0.0.6]: https://github.com/xusenlin/workavera/compare/v0.0.5...v0.0.6
[0.0.5]: https://github.com/xusenlin/workavera/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/xusenlin/workavera/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/xusenlin/workavera/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/xusenlin/workavera/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/xusenlin/workavera/releases/tag/v0.0.1
