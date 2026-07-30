# Workavera Agent Notes

## Project Overview

Workavera is a self-hosted AI team workspace. The backend is a Go 1.26.5 + PocketBase application, and the frontend is a Vite + React + TypeScript application. Frontend build output lives in `frontend/dist` and is embedded into the Go binary via `frontend/embed.go` (`go:embed`), so a built binary is self-contained.

Key backend entry points:

- `workavera.go` creates the PocketBase app, registers feature packages, enables migrations during `go run`, and serves the embedded `frontend/dist` assets.
- `internal/board/` contains board routes, domain validation hooks, project/task logic, and activity logging.
- `internal/chat/` contains chat persistence, SSE streaming, conversation rules, and run cancellation.
- `internal/agent/` wraps Fantasy runner behavior and AI SDK UI-compatible streams.
- `internal/assistant/tools/` adapts application capabilities into assistant tools.
- `internal/contacts/` and `internal/llm/` contain contact queries and model settings APIs.
- `migrations/` contains PocketBase schema migrations and migration tests.

Key frontend entry points:

- `frontend/src/App.tsx` initializes auth and renders the router.
- `frontend/src/router.tsx` defines public and protected routes.
- `frontend/src/pages/` contains route-level pages.
- `frontend/src/components/` contains application components, with reusable UI primitives in `frontend/src/components/ui/`.
- `frontend/src/store/` contains Zustand stores.
- `frontend/src/lib/pocketbase.ts` is the PocketBase client integration.

## Personal Workspace Task Workflow

Users normally identify a task from their personal Workavera workspace as
`Task:<task-id>:<task title>`. Handle these requests in this order:

1. Fetch and read the exact task details before inspecting or changing code.
2. Investigate the issue, explain the likely cause to the user, and wait for
   the user to approve the fix.
3. After approval, move the task to `进行中` before implementing the fix.
4. Implement and verify the fix.
5. After the fix and relevant checks are complete, move the task to `测试中`.

## Commands

Use the task names in `Taskfile.yml` as the source of truth:

- `task dev:go` starts the Go/PocketBase development server.
- `task dev:ui` starts the Vite frontend development server from `frontend/`.
- `task build:ui` builds frontend assets into `frontend/dist` (embedded at Go compile time).
- `task build:go` builds the `workavera` binary with the version from `VERSION`.
- `task build` builds the frontend and then the self-contained binary.
- `task release` cross-compiles self-contained binaries for Linux/macOS/Windows and packages them as `workavera_<version>_<os>_<arch>.tar.gz`/`.zip` archives in the git-ignored `dist/` directory.
- `task run` builds and runs the Go binary.
- `task build:docker` builds frontend assets and the local Docker image.
- `task test` runs `go test ./...`.
- `task tidy` runs `go mod tidy`.

Frontend commands should be run from `frontend/`:

- `pnpm dev`
- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm format`

## Release and Version Workflow

`VERSION` holds the version being developed, never the last one released. It is
raised immediately after a release, so a release promotes what has accumulated
under that number instead of choosing a new one.

The server (`workavera`), Android (`../workavera-android`), and iOS
(`../workavera-ios`) repositories each carry their own `VERSION`,
`CHANGELOG.md`, and tags, and reach their own version numbers. The process
below is the same in all three; only the version files a bump touches and the
artifacts a release produces differ, because the platforms require it.

### While developing

- Leave `VERSION` alone. Record every user-visible change under
  `## [Unreleased]` in `CHANGELOG.md`, in the Keep a Changelog sections
  (`Added`, `Changed`, `Fixed`, `Removed`).
- Never write a dated version heading ahead of time. A version is dated only
  when the user calls the release.

### When the user calls a release

Only an explicit instruction starts this. In each repository being released:

1. Check that `VERSION` holds the version being released, that the tree is
   clean, and that the checks under `## Verification` pass.
2. Promote the changelog: insert `## [<version>] - <YYYY-MM-DD>` directly below
   `## [Unreleased]`, so the accumulated sections become that version's and
   `## [Unreleased]` is left empty above them. Date it the actual release day.
3. Update the link references at the bottom of the changelog: point
   `[Unreleased]` at `compare/v<version>...HEAD` and add
   `[<version>]: compare/v<previous>...v<version>` — or
   `releases/tag/v<version>` when there is no earlier tag to compare against.
4. Commit the promotion on its own as `release: v<version>`, in every
   repository, and tag that commit `v<version>`.
5. Give the user the GitHub release text to paste, both title and body, in
   English and in Chinese. The title is `v<version> — <short summary>`, naming
   what the release is about rather than repeating the number alone. The body
   comes from the section just promoted, in its own wording, and leads with the
   compatibility note when there is one.
6. Remind the user which artifacts to publish, since none are built by
   releasing:
   - server: `task release` for the archives in `dist/`, and `task push` for
     the `ghcr.io/xusenlin/workavera` image tagged `<version>` and `latest`
   - Android: `task build` for the signed APK in `dist/`
   - iOS: an App Store build from Xcode
7. Do not push. The user pushes commits and tags.

### Opening the next cycle

Right after the release, raise the version for continued development in its own
commit, `chore: bump development version to <next>`, touching every file that
repeats the version:

- server: `VERSION`
- Android: `VERSION`, and `versionCode` in `app/build.gradle.kts` — Play
  requires that integer to increase on every upload, and it is the one number
  `VERSION` cannot supply (`versionName` already reads the file)
- iOS: `VERSION`, and `MARKETING_VERSION` in
  `Workavera.xcodeproj/project.pbxproj`, which is kept in step by hand

Work for the next version then continues on that number until the user calls
the next release.

## Development Guidelines

- Bias toward simple, verified changes: state assumptions when they matter, ask when requirements are unclear, and make a brief plan for multi-step or risky work.
- Implement only what was requested. Avoid speculative features, one-off abstractions, unused configurability, and defensive handling for impossible scenarios.
- Make surgical changes: touch only needed files and lines, match existing style, avoid unrelated refactors, and clean up only artifacts introduced by the current change.
- Prefer existing package boundaries, helper APIs, dependencies, and libraries before adding custom code.
- Prefer PocketBase built-in CRUD and related APIs first, including adjusting API rules in migrations when needed; add custom endpoints only when built-in behavior cannot satisfy the requirement.
- Keep backend route registration inside the owning feature package; register from `workavera.go` only when adding a new top-level feature.
- Protect user-facing API routes with the same auth pattern as nearby routes, usually `apis.RequireAuth("users")`.
- Keep PocketBase schema changes in `migrations/`; add focused migration tests when collection rules or important behavior are involved.
- Do not edit `pb_data/`, `frontend/dist/`, `frontend/node_modules/`, or generated build artifacts unless the task explicitly requires it.
- Mention unrelated dead code or problems instead of changing them.
- Follow Go formatting and idioms for backend changes.
- Use `pnpm` for frontend dependency and script work because the project maintains `pnpm-lock.yaml`.
- Match the existing frontend stack: React Router, Zustand, Tailwind CSS v4, local UI primitives, and established component conventions.
- When adding shadcn/ui components, use `pnpm dlx shadcn@latest add <component>` instead of hand-rolling equivalents.
- For UI changes, reuse components from `frontend/src/components/ui/` before adding new primitives.

## Verification

Choose checks based on the files changed:

- Prefer verifiable goals: reproduce bugs with a focused test when practical, make the test pass, and run the smallest useful check before broader validation.
- Backend code or migrations: `task test`, or focused `go test ./internal/...`.
- Frontend TypeScript or components: run `pnpm typecheck` and `pnpm lint` from `frontend/`.
- Frontend build behavior: run `pnpm build` from `frontend/`, or run `task build:ui`.
- Full packaged app behavior: run `task build:ui`, then `task dev:go` or `task run`.
