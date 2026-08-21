# Workavera

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)

[简体中文](./README.zh-CN.md)

> **A self-hosted AI workspace for freelancers and small teams** — projects, docs, calendar, and reading in one binary on your own server, with an assistant that can actually operate them, inside your own permissions.

> ⚠️ **Early-stage software (0.x).** Features and data schemas are still changing quickly, and releases may include breaking changes (see the [changelog](./CHANGELOG.md)). Back up `pb_data` before upgrading. It is not ready for production use yet.

Workavera keeps your projects, tasks, documents, calendar, saved links, and contacts in one place, and Chat is how you put them in motion: the assistant works through the same capabilities your account already has—finding context, creating and updating records—and the server re-authorizes every action against your own permissions before it is applied.

## Why Workavera

Self-hosted AI tools are a crowded space, and most of them sit on one of two sides:

- **Chat front-ends** (Open WebUI, LibreChat, and similar) put a UI over model APIs. The conversation is the whole product—there is no workspace behind it for the AI to act on.
- **Knowledge workspaces** (AFFiNE, AppFlowy, and similar) manage notes and projects, with AI attached as a writing assistant. The AI suggests text; it doesn't operate the workspace.

Workavera is an attempt at the middle:

- **Permission-aware AI tool calling.** Chat can search your context and operate Board, Calendar, Docs, Reading, and Contacts—but only within the permissions your account already has, and the server re-authorizes every tool call (identity, role, ownership, revision). The AI is never a privileged service account.
- **One self-contained binary.** The frontend is embedded via `go:embed` and data lives in PocketBase/SQLite—no Postgres, Redis, or vector-database stack. Deploy with a single `docker run` or a single downloaded binary.
- **Reachable from the AI tools you already use.** The same tools are exposed over MCP at `/api/mcp`, so clients such as Claude Code and Cursor can work against your workspace with a scoped API key.
- **Bring your own model.** Configure API keys for providers you already pay for, or point Chat at a model running on your own hardware. Workavera ships no model and runs no inference of its own, and it is open source under Apache-2.0.

## Data privacy

Self-hosting settles most of it: projects, tasks, docs, calendar, reading list, contacts, and the full chat history live in the `pb_data` SQLite file on your own machine. Workavera has no telemetry and no vendor backend. The only traffic that leaves the server is traffic you configured—calls to the model provider you added in Settings, and any external MCP servers you connected.

The model call is usually the last piece of data that goes to a third party, and you can keep that in-house too. A local server is added in Settings exactly like a hosted provider, and all four protocols are available for it—OpenAI, OpenAI-compatible, Anthropic Messages, and Google—so LM Studio, Ollama, vLLM, and llama.cpp all fit; pick the protocol matching the endpoint your server exposes.

| Field | Value |
| --- | --- |
| Protocol | whichever endpoint the server exposes. LM Studio serves both OpenAI-compatible and Anthropic-compatible; Ollama serves OpenAI-compatible |
| Base URL | the server's origin, e.g. `http://127.0.0.1:1234` for Anthropic, `http://127.0.0.1:1234/v1` for the OpenAI protocols (Ollama: port 11434) |
| Model ID | whatever the server reports, e.g. `qwen/qwen3.8-27b` |
| API key | leave empty—local servers do not check it |

This is a supported path, not a theoretical one. A 27B-class local model—Qwen3.8 27B, MLX 4-bit, about 16 GB on disk—served by LM Studio on a single Apple silicon Mac, reached over its Anthropic-compatible endpoint, runs Chat end to end: multi-turn reasoning, workspace tool calls against Board, Calendar, Docs and Reading, and external MCP tools on top. With that setup the whole loop—your workspace data, the prompts built from it, the tool results—stays on your own hardware, and Workavera keeps working with the network unplugged.

Two things worth knowing before you rely on it:

- **Tool calling is where small models break first.** Answer quality degrades gently as models get smaller; the ability to emit well-formed tool calls turn after turn does not. Prefer a model with solid tool-calling support, and expect roughly 16 GB of free memory for a 27B 4-bit quantization.
- **A local model does not make external MCP servers local.** If you connect a hosted MCP server (web search, for example), the arguments the model sends it still leave your machine.

The base URL is dialed by the Workavera server, not by your browser. If Workavera runs in a container whose network mode cannot see the host's `127.0.0.1`, point it at `http://host.docker.internal:1234` instead.

## Screenshots

### Dashboard

![Workavera Dashboard with workspace overview, due tasks, and upcoming events](./screenShot/en/dashboard.png)

### DeepSeek creating a project and calendar plan

![Workavera Chat using DeepSeek and workspace tools to create project tasks and calendar events](./screenShot/en/chat-deepseek.png)

### Board

![Workavera Board Kanban with workflow columns, priorities, and due dates](./screenShot/en/board.png)

### Calendar

![Workavera Calendar combining personal events and Board task deadlines](./screenShot/en/calendar.png)

### Bring your own model

![Workavera Settings with DeepSeek configured as the default model](./screenShot/en/settings.png)

## Mobile apps (preview)

Native Workavera clients for Android and iOS are in active development. They
connect directly to your self-hosted Workavera server, bringing your workspace
to phones and tablets without routing its data through a separate service.

- **[Download Workavera for Android](https://github.com/xusenlin/workavera-android/releases/latest)**
  from GitHub Releases. It is built with Kotlin and Jetpack Compose, and its
  [source code](https://github.com/xusenlin/workavera-android) is open.
- **[Get Workavera for iOS on the App Store](https://apps.apple.com/app/workavera/id6794339518).**
  The native SwiftUI app supports iPhone and iPad; its source is not public yet
  and will be open-sourced later.

Both apps are early previews; features may be incomplete or trail the web app
while development continues.

### Server compatibility

An app talks to the server's collections directly, so it needs a server new
enough to have the ones it queries. Upgrade the server first, then the apps.

| Android / iOS | Requires server | Because |
| --- | --- | --- |
| 1.0.2 | 0.0.10 or newer | task archiving reads `board_tasks.archived` |
| 1.0.1 | 0.0.9 or newer | user-owned MCP servers read `mcp_servers` |

A newer server keeps older apps working, minus what they do not know about: an
app older than 1.0.2 does not filter archived tasks, so archived tasks stay
visible on its Board.

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

1. **Sign in with the demo user.** A fresh data directory automatically gets one application user: `demo@workavera.local` with password `workavera`.
2. **Secure the account.** Change the demo password from Profile before exposing Workavera to other machines or the public internet.
3. **Create the superuser.** PocketBase prints a one-time setup link containing a token, e.g. `http://127.0.0.1:8090/_/#/pbinstal/<token>`. Find it in the terminal output (or in `docker logs` for a detached container), open it, and create the superuser used to manage collections and application users. The superuser itself cannot sign in to Workavera.
4. **Add a model.** In Settings, add at least one model configuration before using Chat or AI summaries.

The demo user is seeded only when the `users` collection is empty, so upgrades do not add or overwrite an account in an existing workspace.

## Product areas

One line each; the [product documentation](#product-documentation) below carries the detail.

- **Board** manages Kanban projects with custom workflow states, labels, members and roles, due dates, task activity history, and ten bilingual project templates.
- **Docs** stores private and project documents with rich-text editing, explicit versions and conflict detection, Markdown/HTML export, AI editing, and public links that serve a published revision to readers without an account.
- **Calendar** combines personal events and visible Board deadlines in one view, with recurrence and in-app reminders.
- **Chat** is where you work with the model: durable streaming conversations that survive browser disconnects, with visible reasoning and tool calls, automatic compaction of long conversations, and optional long-term memory that is off by default.
- **Reading** saves external links and notes with projects, tags, read state, and AI summaries.
- **Contacts** provides a searchable team contact list with personal favorites.
- **Dashboard, Notifications, and Settings** cover the workspace overview, the in-app notification inbox, model configuration and sharing, appearance, and profile.

## Development

Only needed when contributing or building from source. Requires Go 1.26.5+, Node.js with [pnpm](https://pnpm.io/), and [Task](https://taskfile.dev/) 3+.

```bash
cd frontend && pnpm install && cd ..   # once

task dev:go     # backend at http://127.0.0.1:8090 (admin UI at /_/)
task dev:ui     # Vite dev server at http://127.0.0.1:5173
task test       # go test ./...
task build      # self-contained binary with the frontend embedded
task release    # cross-compiled release archives in dist/
```

All tasks are defined in [`Taskfile.yml`](./Taskfile.yml); frontend-only commands are documented in [`frontend/README.md`](./frontend/README.md).

## Product documentation

| Module | English | 简体中文 |
| --- | --- | --- |
| Board | [Board PRD](./doc/board-prd.md) | [Board PRD](./doc/board-prd.zh-CN.md) |
| Calendar | [Calendar PRD](./doc/calendar-prd.md) | [Calendar PRD](./doc/calendar-prd.zh-CN.md) |
| Chat | [Chat PRD and Fantasy architecture](./doc/chat-fantasy-plan.md) | [Chat PRD 与 Fantasy 架构](./doc/chat-fantasy-plan.zh-CN.md) |
| Chat Memory | [Chat Memory PRD](./doc/chat-memory-prd.md) | [Chat 记忆 PRD](./doc/chat-memory-prd.zh-CN.md) |
| Docs | [Docs PRD](./doc/docs-prd.md) | [Docs PRD](./doc/docs-prd.zh-CN.md) |

## Changelog

Release history is documented in [CHANGELOG.md](./CHANGELOG.md).

## License

Licensed under the [Apache License 2.0](./LICENSE).

Copyright 2026 xusenlin
