# Workavera Frontend

[简体中文](./README.zh-CN.md) · [Repository README](../README.md)

This directory contains the Workavera Vite, React, and TypeScript application. Production output is written to `frontend/dist` and served by the Go/PocketBase application.

## Stack

- React 19 and React Router 8
- TypeScript 6 and Vite 8
- Tailwind CSS 4
- Local shadcn/ui primitives in `src/components/ui`
- Zustand stores
- PocketBase JavaScript SDK and realtime subscriptions
- AI SDK React and AI Elements-style components
- Milkdown Crepe for Markdown documents
- CodeMirror language packages for document and micro-app code editing

## Development

Install dependencies:

```bash
pnpm install
```

Start the Go/PocketBase server from the repository root:

```bash
task dev:go
```

Start Vite from this directory:

```bash
pnpm dev
```

Open <http://127.0.0.1:5173>. The Vite server proxies `/api` to <http://127.0.0.1:8090>.

Set `VITE_POCKETBASE_URL` to use another PocketBase origin. Without it, the frontend uses `window.location.origin`.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the Vite development server |
| `pnpm build` | Run the project build and emit `dist` |
| `pnpm typecheck` | Run TypeScript without emitting files |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Format TypeScript and TSX with Prettier |
| `pnpm preview` | Preview the built frontend |

For a normal frontend change, run:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Source layout

```text
src/
├── components/
│   ├── ai-elements/    # Streamed chat presentation primitives
│   ├── board/          # Board and task surfaces
│   ├── calendar/       # Calendar lists and event sheet
│   ├── chat/           # Conversation and tool-result UI
│   ├── docs/           # Milkdown document editor
│   ├── notifications/  # Notification items
│   └── ui/             # Reusable local UI primitives
├── pages/              # Lazy-loaded route pages
├── store/              # Zustand feature stores
├── lib/                # PocketBase, navigation, timezone, and helpers
├── types/              # Shared frontend types
├── router.tsx          # Protected application routes
└── App.tsx             # Authentication and theme initialization
```

## UI development

- Reuse components from `src/components/ui` before adding a new primitive.
- Add shadcn/ui components with:

  ```bash
  pnpm dlx shadcn@latest add <component>
  ```

- Keep feature components inside their existing module directories.
- Use the shared `workspaceRecordUrl` helper for record deep links.
- Keep PocketBase access in established stores or page services and preserve owner/member rules enforced by the backend.
- Do not edit `dist` or `node_modules` directly.
