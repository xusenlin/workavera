# Changelog

All notable changes to Workavera are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## [0.0.7] - Unreleased

### Changed

- Document lists now return metadata only and fetch full content when a
  document is selected, reducing duplicate transfers for large HTML documents.

### Fixed

- HTML document previews now keep anchor links inside the rendered document
  instead of navigating the sandboxed frame to an empty application page.

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

[0.0.7]: https://github.com/xusenlin/workavera/compare/v0.0.6...HEAD
[0.0.6]: https://github.com/xusenlin/workavera/compare/v0.0.5...v0.0.6
[0.0.5]: https://github.com/xusenlin/workavera/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/xusenlin/workavera/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/xusenlin/workavera/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/xusenlin/workavera/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/xusenlin/workavera/releases/tag/v0.0.1
