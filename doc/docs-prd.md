# Docs Product Requirements Document

[简体中文](./docs-prd.zh-CN.md)

> Implementation baseline: Workavera `0.0.2`, verified against commit `3684be1` on 2026-07-13.

## 1. Purpose

Docs is Workavera's reusable knowledge layer. It stores private notes and Board project documents as Markdown, provides rich and source editing, preserves explicit save history, prevents silent concurrent overwrites, and lets Chat create or revise documents with the same permission and revision rules.

Project documents can be linked to Board tasks in the same project.

## 2. Goals

- Create private documents or documents shared through a Board project.
- Keep Markdown as the only persisted document-body format.
- Offer Rich text, Source, Diff, and fullscreen editing experiences.
- Save only on explicit user or AI actions; never auto-save server content.
- Create an immutable version for every changed save.
- Detect concurrent edits with optimistic revision checks.
- Reuse Board owner/member roles for project-document access.
- Support personal pins, search, pagination, archive, restore, and permanent deletion.
- Let Chat search, read, create, fully update, and precisely replace Markdown.
- Let Board tasks link active documents from their own project.

## 3. Non-goals

- Character-level realtime collaboration, remote cursors, or presence.
- Automatic server saves or timed version creation.
- Comments, annotations, mentions, or document notifications.
- Folders, backlinks, graph views, block references, or semantic/vector search.
- Custom per-document collaborators outside Board project membership.
- Persisting editor JSON, HTML, MDX, JSX, or custom components.
- Image and file attachments.
- Public publishing.
- Moving a project document back to private space or directly to another project.

## 4. Core rules

1. `docs.content` is the canonical document body and contains Markdown.
2. `docs` stores the latest revision; `doc_versions` stores immutable snapshots.
3. Creation produces revision 1 and a matching version record.
4. Title and content edits remain local until Save or an explicit Assistant mutation.
5. A save must submit the current `baseRevision`; a stale revision returns HTTP 409.
6. A no-op save returns the existing document and creates no version.
7. Restoring an older version creates a new highest revision with source `restore`.
8. Private documents are visible and editable only by their owner.
9. Project documents are visible to the project owner and all project members. Owner, admin, and member roles can edit; viewer is server-enforced read-only.
10. Only the document creator can archive, unarchive, or permanently delete it.
11. A private document owner may move it once into a project where they can edit.
12. Pins are per-user preferences. Each user may pin at most six accessible documents.
13. Archived documents cannot be edited and are excluded from normal search and pinned results.

## 5. Data model

### `docs`

| Field | Type | Notes |
| --- | --- | --- |
| `title` | text | Required, max 240 characters |
| `content` | text | Markdown, max 1 MiB |
| `owner` | relation → users | Creator and private owner; cascade delete |
| `project` | relation → board_projects | Empty for private documents |
| `status` | select | `draft` or `archived` |
| `revision` | number | Positive integer starting at 1 |
| `last_edited_by` | relation → users | Actor of the latest changed save |
| `created`, `updated` | autodate | Record timestamps |

Indexes support owner, project, status, and recent ordering. PocketBase list/view rules expose private records to their owner and project records to project participants. Client Records API writes are disabled; mutations use Docs services.

### `doc_versions`

| Field | Type | Notes |
| --- | --- | --- |
| `doc` | relation → docs | Required, cascade delete |
| `revision` | number | Unique with `doc` |
| `title` | text | Title snapshot |
| `content` | text | Markdown snapshot, max 1 MiB |
| `created_by` | relation → users | User who initiated the save |
| `source` | select | `user`, `ai`, or `restore` |
| `created` | autodate | Save time |

Version list requests return up to 100 revisions in descending order. List entries omit full content; an individual version request returns its Markdown.

### `doc_pins`

| Field | Type | Notes |
| --- | --- | --- |
| `user` | relation → users | Pin owner, cascade delete |
| `doc` | relation → docs | Pinned document, cascade delete |
| `created` | autodate | Pin time |

`user + doc` is unique. Pin writes use the Docs API so the six-document limit and document access are checked transactionally.

## 6. Save and concurrency behavior

### Create

`POST /api/docs` accepts title, Markdown content, and an optional project ID. The service validates the actor and project edit role, then creates the current document and revision-1 version in one transaction.

### Save

`PUT /api/docs/{id}` accepts the complete title, complete Markdown content, and `baseRevision`.

Within one transaction, the service:

1. verifies access, edit role, and non-archived status;
2. compares `baseRevision` with the current revision;
3. returns without writing if title and content are unchanged;
4. increments the revision, updates `last_edited_by`, and saves the document;
5. creates the version with the same revision and source.

On HTTP 409, the editor keeps the local draft, displays `New version available`, and offers `Load latest`. Realtime events automatically reload the document only when the local draft is clean.

### Restore

The history dialog previews a selected revision's Markdown. Restore requires the current base revision and creates a new version sourced as `restore`; existing history remains unchanged.

### Move to project

Only the owner of a private document can move it. The target project must grant owner, admin, or member access. Moving changes the access scope without changing the content revision or creating a version. The document cannot be moved back or moved directly to another project.

## 7. Editor experience

Docs uses Milkdown Crepe with application-owned controls.

- Rich text is the default editing mode.
- Source mode edits the same Markdown string in a plain textarea.
- Diff mode compares the current local draft with the last persisted Markdown using line-level additions and removals.
- Fullscreen uses the browser Fullscreen API for the editor surface.
- The toolbar supports undo/redo, paragraph and H1-H3, bold, italic, inline code, link, bullet and numbered lists, quote, code block, table, and divider.
- Code blocks support lazy language loading for common programming and markup languages.
- The title is edited inline; the header shows `vN`, `Unsaved · vN`, or a newer-version warning, while the Save action shows its in-progress state.
- Navigating away or reloading with a dirty draft triggers a warning. Drafts are not persisted in local storage.

The same `draftContent` powers every editor mode. Mode switches and fullscreen do not save or increment revisions.

## 8. List, archive, and history experience

- The left pane shows Pinned before Recent and automatically selects the first available document.
- Active non-pinned documents use server-side PocketBase pagination with 15 items per page, sorted by `updated` descending.
- Title/content search is applied server-side to the paginated list and locally to the maximum six pinned documents.
- List entries show title, project/private context, and revision.
- Pin/unpin is available for accessible documents.
- Creator-only actions include archive and permanent delete; delete confirmation states that all versions are removed.
- The archive dialog uses 10 items per page and lets creators restore or permanently delete documents.
- The document URL uses the shared `record` query parameter for deep links from Chat, Board, Dashboard, and other modules.

## 9. HTTP API

- `POST /api/docs`
- `PUT /api/docs/{id}`
- `POST /api/docs/{id}/move-to-project`
- `GET /api/docs-pinned`
- `POST /api/docs/{id}/pin`
- `POST /api/docs/{id}/archive`
- `POST /api/docs/{id}/unarchive`
- `DELETE /api/docs/{id}`
- `GET /api/docs/{id}/versions`
- `GET /api/docs/{id}/versions/{revision}`
- `POST /api/docs/{id}/restore/{revision}`

All endpoints require `users` authentication. Inaccessible private/project documents use not-found semantics where appropriate to avoid revealing record existence.

## 10. Assistant tools

- `docs_search`: searches visible active documents by title/content and returns metadata plus an excerpt; default 20, maximum 50.
- `docs_get`: returns complete current Markdown and revision.
- `docs_upsert`: creates a document or writes a complete replacement using `baseRevision`. Its `kind` is required; before creating, the Assistant briefly asks the user to choose simple, easily editable Markdown or rich, interactive HTML when no kind was specified.
- `docs_replace`: replaces the first or all exact Markdown matches using `baseRevision`.

The Assistant must call `docs_get` before updating, reuse the returned kind and revision, serialize mutations to the same document, and never overwrite a conflict. Successful AI changes create versions with source `ai`; unchanged upserts and unmatched replacements create no version.

## 11. Board integration

`board_tasks.documents` links up to 20 documents. The server accepts only documents whose `project` matches the task's project. The Board picker lists active project documents, task activity records title-based link changes, and deleting a document automatically removes its task relations without deleting tasks.

## 12. Acceptance criteria

- Private and project documents follow the server-side access matrix.
- Creation and every changed explicit save create matching immutable revisions.
- No-op saves create no version, and stale saves cannot silently overwrite newer content.
- Realtime changes preserve dirty local drafts and refresh clean documents.
- Rich text, Source, Diff, fullscreen, history preview, and restore operate on canonical Markdown.
- Search, pagination, per-user pins, archive, unarchive, and permanent deletion follow their limits and ownership rules.
- Chat document mutations obey permissions and optimistic concurrency.
- Board tasks accept only same-project document links and survive linked-document deletion.
