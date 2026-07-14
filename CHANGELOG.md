# Changelog

All notable changes to Workavera are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/xusenlin/workavera/compare/v0.0.3...HEAD
[0.0.3]: https://github.com/xusenlin/workavera/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/xusenlin/workavera/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/xusenlin/workavera/releases/tag/v0.0.1
