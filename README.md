# Workavera

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)

[简体中文](./README.zh-CN.md)

**One self-contained binary. A full team workspace. An AI that can only do what you can do—every AI action is re-authorized by the server against your own permissions.**

Workavera is a self-hosted AI team workspace that connects conversations, knowledge, relationships, projects, tasks, and time commitments in one application.

**Use Chat to put your workspace in motion.** AI can use the workspace capabilities you already have permission to use—finding context and creating or updating supported records—without receiving access beyond your own. Every action is authorized again by the server before it is applied.

It uses Go and PocketBase for the backend and Vite, React, and TypeScript for the frontend. The compiled frontend is embedded into the Go binary (`go:embed`) and served by the same PocketBase process, so a release ships as a single self-contained executable.

## Why Workavera

Self-hosted AI tools are a crowded space, but most of them fall on one of two sides:

- **Chat front-ends** (Open WebUI, LibreChat, and similar) put a UI over model APIs. The conversation is the whole product—there is no workspace behind it for the AI to act on.
- **Knowledge workspaces** (AFFiNE, AppFlowy, and similar) manage notes and projects and bolt AI on as a writing assistant. The AI suggests text; it doesn't operate the workspace.

Workavera combines both halves and adds the part neither has:

- **Permission-aware AI tool calling.** Chat can search your context and operate Board, Calendar, Docs, Reading, Contacts, and AI Micro Apps—but only within the permissions your account already has, and the server re-authorizes every tool call (identity, role, ownership, revision). The AI is never a privileged service account.
- **One self-contained binary.** The frontend is embedded via `go:embed` and data lives in PocketBase/SQLite—no Postgres, Redis, or vector-database stack. Deploy with a single `docker run` or a single downloaded binary.
- **Built for freelancers and small teams.** Bring your own model API keys, run it on a cheap VPS or a NAS, and own all of your data. Open source under Apache-2.0.

## Screenshots

### Dashboard

![Workavera Dashboard with workspace overview, due tasks, and upcoming events](./screenShot/en-home.png)

### Chat creating a Board project

![Workavera Chat using Board tools to pick a template and create a project with tasks](./screenShot/en-chat-task.png)

### Board

![Workavera Board Kanban with workflow columns, labels, priorities, and due dates](./screenShot/en-board.png)

### Chat creating Calendar events

![Workavera Chat creating recurring calendar events with reminders](./screenShot/en-chat-calendar.png)

### Calendar

![Workavera Calendar combining personal events and Board task deadlines](./screenShot/en-calendar-events.png)

## Quick start

No toolchain needed—run the prebuilt image or binary.

### Docker

```bash
docker run -p 8090:8090 -v workavera-data:/app/pb_data ghcr.io/xusenlin/workavera:latest
```

### Prebuilt binary

Download the archive for your platform from [GitHub Releases](https://github.com/xusenlin/workavera/releases), extract it, and start the server from a terminal (it is a server process, so double-clicking the binary is not enough):

```bash
./workavera serve            # workavera.exe serve on Windows
```

By default it listens on <http://127.0.0.1:8090>. Pass `--http=0.0.0.0:8090` to accept connections from other machines.

### First-run setup

1. **Create the superuser.** On the first start, PocketBase prints a one-time link containing a token, e.g. `http://127.0.0.1:8090/_/#/pbinstal/<token>`. Find it in the terminal output (or in `docker logs` for a detached container), open it in a browser, and create the superuser account.
2. **Create an application user.** In the Admin UI at <http://127.0.0.1:8090/_/>, add a record to the `users` collection. Workavera's login page only accepts these admin-created accounts—the superuser itself cannot sign in to the app.
3. **Sign in and add a model.** Open <http://127.0.0.1:8090>, sign in with that user, and add at least one model configuration in Settings before using Chat or AI summaries.

## Product areas

- **Dashboard** shows counts for active projects, open tasks, the next seven days, and unread Reading items, together with due tasks, upcoming events and deadlines, recently updated Docs/Chat/Reading records, and quick links.
- **Reading** saves external URLs and notes with project, tags, read status, pins, archive, configurable summary language, and AI-generated summaries.
- **Contacts** provides a searchable contact list, detailed profiles, and personal favorites; Chat can search a bounded, non-sensitive contact projection.
- **Chat** streams model output, reasoning, and tool calls into durable conversations. Runs continue across browser disconnects and can be resumed or stopped.
- **Docs** stores private and project Markdown documents with Milkdown rich editing, Source/Diff/fullscreen modes, explicit versions, conflict detection, pins, archive, and AI editing.
- **Board** manages independent project workflows, labels, roles, tasks, activity history, due dates, and same-project document links. Ten bilingual workflow templates are included.
- **Calendar** combines personal events with visible Board deadlines, supports recurrence and system-timezone scheduling, and produces in-app reminders.
- **AI Micro Apps** manages self-contained HTML tools and prototypes with sandboxed preview, pins, archive/restore actions, and Assistant tools for HTML generation and revision.
- **Notifications** provides realtime model-share requests, task-due notices, and calendar reminders with record deep links.
- **Settings and Profile** manage model configurations, model sharing, per-user appearance, profile fields, and avatars.

Reading is the external-information intake layer, Docs is the reusable knowledge layer, Board is the action layer, Calendar is the time-commitment layer, and AI Micro Apps is the interactive delivery layer.

Chat connects these layers as a permission-aware AI control surface. It can search the context visible to you and invoke registered tools for Board, Calendar, Reading, Docs, Contacts, and AI Micro Apps. Tool availability never bypasses product rules: the backend checks identity, role, ownership, relationships, and revisions for every operation.

## Technology

- Go 1.26.4
- PocketBase 0.39.4
- Fantasy 0.35.0
- React 19, TypeScript 6, Vite 8
- Tailwind CSS 4 and local shadcn/ui components
- AI SDK UI message streaming
- Zustand and the PocketBase JavaScript SDK
- Milkdown Crepe for Markdown editing

## Data and security notes

- Runtime data lives in `pb_data/` and is not committed.
- Model API keys stay in the hidden `llm_models.api_key` field and are accessed through authenticated server endpoints.
- User-facing records are protected by PocketBase rules and server-side domain validation.
- Chat history is loaded by the server; browsers do not provide authoritative prior messages.
- Active Chat runs are process-local. Stream reconnection works while the same server process is alive; production multi-instance execution requires shared durable run infrastructure.
- Calendar scheduling and reminders use `configs/system.timezone`.

## Development

Everything below is only needed when contributing or building from source—see [Quick start](#quick-start) if you just want to run Workavera.

### Requirements

- Go 1.26.4 or newer
- Node.js and [pnpm](https://pnpm.io/)
- [Task](https://taskfile.dev/) 3 or newer
- Docker with Buildx only when building or publishing containers

### Local development

Install frontend dependencies once:

```bash
cd frontend
pnpm install
cd ..
```

Run the backend and Vite frontend in separate terminals:

```bash
task dev:go
```

```bash
task dev:ui
```

Open <http://127.0.0.1:5173>. Vite proxies `/api` to PocketBase at <http://127.0.0.1:8090>.

PocketBase also exposes:

- Admin UI: <http://127.0.0.1:8090/_/>
- Health endpoint: <http://127.0.0.1:8090/api/health>

On the first start the server prints the same one-time superuser setup link described in [First-run setup](#first-run-setup); create the superuser and application users the same way. After signing in, add at least one model configuration in Settings before using Chat or AI summaries.

When `task dev:go` runs through `go run`, PocketBase automigration is enabled and schema changes are written to `migrations/`.

### Build and run

Build the frontend and backend:

```bash
task build:ui
task build:go
```

Run the packaged application after the frontend has been built:

```bash
task run
```

Open <http://127.0.0.1:8090>. `task run` rebuilds the Go binary with the current `frontend/dist` embedded, so the resulting binary is fully self-contained.

The version comes from [`VERSION`](./VERSION) and is injected into the binary. Check it with:

```bash
./workavera --version
```

### Commands

| Command | Purpose |
| --- | --- |
| `task dev:go` | Run the Go/PocketBase development server |
| `task dev:ui` | Run the Vite development server |
| `task build:ui` | Type-check and build `frontend/dist` |
| `task build:go` | Build the `workavera` binary (embeds `frontend/dist`) |
| `task build` | Build the frontend and the self-contained binary |
| `task release` | Cross-compile and package release archives for Linux/macOS/Windows into `dist/` |
| `task run` | Build and run the Go binary |
| `task build:docker` | Build the frontend and local `ghcr.io/xusenlin/workavera:latest` image |
| `task push` | Build and push `linux/amd64` version and `latest` images |
| `task test` | Run `go test ./...` |
| `task tidy` | Run `go mod tidy` |

Frontend-only commands are documented in [`frontend/README.md`](./frontend/README.md).

### Binary releases

Cross-compile self-contained binaries for GitHub releases:

```bash
task release
```

This builds the frontend, embeds it, and cross-compiles for three platforms into `dist/`, packaged as compressed archives named by version, OS, and architecture:

- `dist/workavera_<version>_linux_amd64.tar.gz`
- `dist/workavera_<version>_darwin_arm64.tar.gz`
- `dist/workavera_<version>_windows_amd64.zip`

Each archive contains a single self-contained `workavera` binary (`workavera.exe` on Windows)—no separate frontend assets are required at runtime. A `dist/SHA256SUMS.txt` checksum file is generated alongside the archives. The `dist/` directory is git-ignored.

### Docker image

Build the local image:

```bash
task build:docker
```

The container runs as a non-root user, includes CA certificates and timezone data, exposes a health check, stores data in `/app/pb_data`, and ships as a single self-contained binary with the frontend assets embedded. See [Quick start](#quick-start) for the run command.

`task push` uses the value in `VERSION` to publish both `:<version>` and `:latest` for `linux/amd64`.

## Repository structure

```text
.
├── workavera.go                 # PocketBase entry point and frontend serving
├── internal/
│   ├── agent/                   # Fantasy and AI SDK stream adaptation
│   ├── assistant/tools/         # Actor-scoped workspace tools
│   ├── board/                   # Projects, tasks, roles, validation, activity
│   ├── calendar/                # Events, recurrence, and schedule queries
│   ├── chat/                    # Conversations, runs, SSE, persistence
│   ├── configs/                 # System configuration API
│   ├── contacts/                # Contacts and safe Assistant queries
│   ├── docs/                    # Markdown documents and versions
│   ├── llm/                     # Model settings and sharing
│   ├── microapps/               # AI Micro Apps domain and previews
│   ├── notifications/           # Realtime notifications and scheduler
│   └── reading/                 # Reading library and summaries
├── migrations/                  # PocketBase schema migrations and tests
├── frontend/                    # Vite React application
│   └── src/
│       ├── components/          # Feature and UI components
│       ├── pages/               # Route-level pages
│       ├── store/               # Zustand stores
│       └── lib/                 # PocketBase and shared utilities
├── doc/                         # English and Chinese product documents
├── Dockerfile
├── Taskfile.yml
└── VERSION
```

## Product documentation

| Module | English | 简体中文 |
| --- | --- | --- |
| Board | [Board PRD](./doc/board-prd.md) | [Board PRD](./doc/board-prd.zh-CN.md) |
| Calendar | [Calendar PRD](./doc/calendar-prd.md) | [Calendar PRD](./doc/calendar-prd.zh-CN.md) |
| Chat | [Chat PRD and Fantasy architecture](./doc/chat-fantasy-plan.md) | [Chat PRD 与 Fantasy 架构](./doc/chat-fantasy-plan.zh-CN.md) |
| Docs | [Docs PRD](./doc/docs-prd.md) | [Docs PRD](./doc/docs-prd.zh-CN.md) |

## Changelog

Release history is documented in [CHANGELOG.md](./CHANGELOG.md).

## License

Licensed under the [Apache License 2.0](./LICENSE).

Copyright 2026 xusenlin
