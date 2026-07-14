# Workavera

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)

[简体中文](./README.zh-CN.md)

Workavera is a self-hosted AI team workspace that connects conversations, knowledge, relationships, projects, tasks, and time commitments in one application.

**Use Chat to put your workspace in motion.** AI can use the workspace capabilities you already have permission to use—finding context and creating or updating supported records—without receiving access beyond your own. Every action is authorized again by the server before it is applied.

It uses Go and PocketBase for the backend and Vite, React, and TypeScript for the frontend. The compiled frontend is embedded into the Go binary (`go:embed`) and served by the same PocketBase process, so a release ships as a single self-contained executable.

## Screenshots

### Chat and workspace tools

![Workavera Chat using Board tools to create a project](./screenShot/workavera_chat.png)

### Board task details

![Workavera Board task detail](./screenShot/workavera_task.png)

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

## Requirements

- Go 1.26.4 or newer
- Node.js and [pnpm](https://pnpm.io/)
- [Task](https://taskfile.dev/) 3 or newer
- Docker with Buildx only when building or publishing containers

## Local development

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

Create the first PocketBase superuser and application users through the Admin UI. Workavera's login page accepts administrator-created accounts. After signing in, add at least one model configuration in Settings before using Chat or AI summaries.

When `task dev:go` runs through `go run`, PocketBase automigration is enabled and schema changes are written to `migrations/`.

## Build and run

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

## Commands

| Command | Purpose |
| --- | --- |
| `task dev:go` | Run the Go/PocketBase development server |
| `task dev:ui` | Run the Vite development server |
| `task build:ui` | Type-check and build `frontend/dist` |
| `task build:go` | Build the `workavera` binary (embeds `frontend/dist`) |
| `task build` | Build the frontend and the self-contained binary |
| `task release` | Cross-compile self-contained binaries for Linux/macOS/Windows into `dist/` |
| `task run` | Build and run the Go binary |
| `task build:docker` | Build the frontend and local `ghcr.io/xusenlin/workavera:latest` image |
| `task push` | Build and push `linux/amd64` version and `latest` images |
| `task test` | Run `go test ./...` |
| `task tidy` | Run `go mod tidy` |

Frontend-only commands are documented in [`frontend/README.md`](./frontend/README.md).

## Binary releases

Cross-compile self-contained binaries for GitHub releases:

```bash
task release
```

This builds the frontend, embeds it, and cross-compiles for three platforms into `dist/`, named by version, OS, and architecture:

- `dist/workavera_<version>_linux_amd64`
- `dist/workavera_<version>_darwin_arm64`
- `dist/workavera_<version>_windows_amd64.exe`

A `dist/SHA256SUMS.txt` checksum file is generated alongside the binaries. Each file is fully self-contained—no separate frontend assets are required at runtime. The `dist/` directory is git-ignored.

## Docker

Build the local image:

```bash
task build:docker
```

Run it with a persistent PocketBase volume:

```bash
docker run --rm \
  -p 8090:8090 \
  -v workavera-data:/app/pb_data \
  ghcr.io/xusenlin/workavera:latest
```

The container runs as a non-root user, includes CA certificates and timezone data, exposes a health check, stores data in `/app/pb_data`, and ships as a single self-contained binary with the frontend assets embedded.

`task push` uses the value in `VERSION` to publish both `:<version>` and `:latest` for `linux/amd64`.

## Data and security notes

- Runtime data lives in `pb_data/` and is not committed.
- Model API keys stay in the hidden `llm_models.api_key` field and are accessed through authenticated server endpoints.
- User-facing records are protected by PocketBase rules and server-side domain validation.
- Chat history is loaded by the server; browsers do not provide authoritative prior messages.
- Active Chat runs are process-local. Stream reconnection works while the same server process is alive; production multi-instance execution requires shared durable run infrastructure.
- Calendar scheduling and reminders use `configs/system.timezone`.

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

## License

Licensed under the [Apache License 2.0](./LICENSE).

Copyright 2026 xusenlin
