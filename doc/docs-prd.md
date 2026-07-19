# Docs Product Requirements Document

[简体中文](./docs-prd.zh-CN.md)

> Implementation status: current Workavera `0.0.2` workspace behavior, updated 2026-07-18.

## 1. Purpose

Docs is Workavera's reusable knowledge and artifact layer. It stores private notes and Board project documents as Markdown or self-contained HTML, provides kind-appropriate editing and preview experiences, preserves explicit save history, prevents silent concurrent overwrites, and lets Chat create or revise documents with the same permission and revision rules.

Project documents can be linked to Board tasks in the same project.

## 2. Goals

- Create private Markdown documents or self-contained HTML apps, optionally shared through a Board project.
- Keep an immutable document kind and persist canonical Markdown or HTML source in `docs.content`.
- Offer BlockNote rich-text/source editing for Markdown, sandboxed preview/source editing for HTML, export, attachments, and fullscreen.
- Save only on explicit user or AI actions; never auto-save server content.
- Create an immutable version for every changed save.
- Detect concurrent edits with optimistic revision checks.
- Reuse Board owner/member roles for project-document access.
- Support one-level personal folders, personal pins, search, pagination, archive, restore, and permanent deletion.
- Let Chat search, read, create, fully update, precisely replace Markdown, and stream large document writes in chunks.
- Let Board tasks link active documents from their own project.

## 3. Non-goals

- Character-level realtime collaboration, remote cursors, or presence.
- Automatic server saves or timed version creation.
- Comments, annotations, mentions, or document notifications.
- Nested folders, project folders, backlinks, graph views, block references, or semantic/vector search.
- Custom per-document collaborators outside Board project membership.
- Persisting editor-specific JSON, MDX, JSX, or multi-file HTML application bundles.
- Public publishing.

## 4. Core rules

1. `docs.content` is the canonical document body; its format is determined by the immutable `kind` (`markdown` or `html`).
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
12. Pins are per-user preferences. Each user may pin at most ten accessible documents.
13. Archived documents cannot be edited and are excluded from normal search and pinned results.
14. `project` and `folder` are mutually exclusive; documents with neither are directly in `My documents`.
15. Personal folders only organize their owner's private documents; deleting a folder returns its documents to `My documents` without deleting them or creating versions.
16. HTML documents must remain self-contained and are rendered in a sandboxed opaque origin; development-server asset references are rejected.

## 5. Data model

### `docs`

| Field | Type | Notes |
| --- | --- | --- |
| `title` | text | Required, max 240 characters |
| `kind` | select | Immutable `markdown` or `html` |
| `content` | text | Canonical Markdown or self-contained HTML, max 1 MiB |
| `owner` | relation → users | Creator and private owner; cascade delete |
| `project` | relation → board_projects | Empty for private documents |
| `folder` | relation → doc_folders | Optional and only valid for private documents |
| `status` | select | `draft` or `archived` |
| `revision` | number | Positive integer starting at 1 |
| `last_edited_by` | relation → users | Actor of the latest changed save |
| `created`, `updated` | autodate | Record timestamps |

Indexes support owner, project, folder, status, and recent ordering. PocketBase list/view rules expose private records to their owner and project records to project participants. Client Records API writes are normally disabled; the exception is the `folder` field of active private documents. Owners may update it while server rules and hooks prevent project/folder combinations, foreign folders, or changes to other document fields.

### `doc_folders`

| Field | Type | Notes |
| --- | --- | --- |
| `name` | text | Required, maximum 80 characters, case-insensitively unique per owner |
| `owner` | relation → users | Folder owner, cascade delete |
| `created`, `updated` | autodate | Record timestamps |

Folders use PocketBase's built-in CRUD with owner API rules. They are one level deep and sorted by name. Deleting a folder makes PocketBase clear the optional, non-cascading `docs.folder` relation.

### `doc_assets`

| Field | Type | Notes |
| --- | --- | --- |
| `doc` | relation → docs | Required, cascade delete |
| `file` | protected file | One allowed image/document/archive file, maximum 10 MiB |
| `kind` | select | `image` or `file` |
| `original_name`, `media_type`, `size` | metadata | Original upload metadata |
| `sha256` | hidden text | Deduplication hash, unique with document and original name |
| `uploaded_by` | relation → users | Uploading editor |
| `created` | autodate | Upload time |

Assets inherit document visibility. Uploads use the authenticated Docs asset endpoint, require document edit permission, reject unsupported media types, and are deleted with their document. Markdown stores protected asset links; export resolves images into a self-contained HTML result.

### `doc_versions`

| Field | Type | Notes |
| --- | --- | --- |
| `doc` | relation → docs | Required, cascade delete |
| `revision` | number | Unique with `doc` |
| `title` | text | Title snapshot |
| `content` | text | Body snapshot in the document's kind, max 1 MiB |
| `created_by` | relation → users | User who initiated the save |
| `source` | select | `user`, `ai`, or `restore` |
| `created` | autodate | Save time |

Version list requests return up to 100 revisions in descending order. List entries omit full content; an individual version request returns the complete body.

### `doc_pins`

| Field | Type | Notes |
| --- | --- | --- |
| `user` | relation → users | Pin owner, cascade delete |
| `doc` | relation → docs | Pinned document, cascade delete |
| `created` | autodate | Pin time |

`user + doc` is unique. Pin writes use the Docs API so the ten-document limit and document access are checked transactionally.

## 6. Save and concurrency behavior

### Create

`POST /api/docs` accepts title, immutable kind, canonical content, and mutually exclusive optional project or personal-folder IDs. With neither location ID, the document is created in `My documents`. The service validates the actor, kind-specific content, and destination, then creates the current document and revision-1 version in one transaction.

### Save

`PUT /api/docs/{id}` accepts the complete title, complete content in the stored kind, and `baseRevision`.

Within one transaction, the service:

1. verifies access, edit role, and non-archived status;
2. compares `baseRevision` with the current revision;
3. returns without writing if title and content are unchanged;
4. increments the revision, updates `last_edited_by`, and saves the document;
5. creates the version with the same revision and source.

On HTTP 409, the editor keeps the local draft, displays `New version available`, and offers `Load latest`. Realtime events automatically reload the document only when the local draft is clean.

### Restore

The history dialog previews a selected revision's body. Restore requires the current base revision and creates a new version sourced as `restore`; existing history remains unchanged.

### Move between locations

Only the document creator can move it. A document can move between `My documents`, the creator's one-level personal folders, and projects where the creator has owner, admin, or member access. Moving changes the location and access scope without changing the content revision or creating a version. When a document leaves a project, the same transaction removes it from every task in that project so cross-project document relations cannot remain.

## 7. Editor experience

Markdown documents use BlockNote with the application-owned document schema; HTML documents use a source editor plus sandboxed preview.

- Markdown rich text is the default mode and serializes back to the same canonical Markdown string; Source edits that string directly.
- BlockNote provides structured text, headings, formatting, links, lists, quotes, code blocks, tables, dividers, images, and file attachments through its toolbar and slash menu.
- Code blocks use lazy syntax-language loading. Document attachments render as download cards, while images render inline.
- HTML documents toggle between source and preview. Preview uses `srcdoc` in a sandbox without `allow-same-origin`, so scripts cannot reach the parent page or PocketBase session.
- Markdown documents export as `.md` or self-contained `.html`; HTML documents export their source as `.html`.
- Fullscreen uses the browser Fullscreen API for the editor surface.
- The title is edited inline; the header shows `vN`, `Unsaved · vN`, or a newer-version warning, while Save shows its in-progress state.
- Navigating away or reloading with a dirty draft triggers a warning. Drafts are not persisted in local storage.

The same `draftContent` powers each kind's source and rendered modes. Mode switches, previews, exports, uploads, and location moves do not save document content or increment revision.

## 8. List, archive, and history experience

- The left pane has exactly three modes: Pinned, Recent, and Locations. Switching modes or locations, and archiving or deleting the selected document, clears the editor until the user explicitly selects a document; explicit document deep links still open their target.
- Pinned shows up to ten user-pinned documents with no location selector or pagination. Recent shows the ten most recently edited accessible documents with no location selector or pagination.
- Locations exposes a grouped, scrollable selector for the `My documents` root, one-level personal folders, and active projects in the user's Board order. Only Locations uses server-side PocketBase pagination with 15 items per page.
- Title/content search is scoped to the current mode. Locations searches its current server-paginated location; Pinned and Recent remain capped at ten results. AI search returns 20 results by default and at most 50.
- List entries show title, project/private context, and revision.
- Pin/unpin is available for accessible documents.
- Creator-only actions include archive and permanent delete; delete confirmation states that all versions are removed.
- The archive dialog uses 10 items per page and lets creators restore or permanently delete documents.
- The document URL uses the shared `open` query parameter for deep links from Chat, Board, Dashboard, and other modules, plus `view` and optional `location` parameters for Docs navigation state.

## 9. HTTP API

- `POST /api/docs`
- `PUT /api/docs/{id}`
- `POST /api/docs/{id}/assets`
- `POST /api/docs/{id}/move`
- `GET /api/docs-pinned`
- `POST /api/docs/{id}/pin`
- `POST /api/docs/{id}/archive`
- `POST /api/docs/{id}/unarchive`
- `DELETE /api/docs/{id}`
- `GET /api/docs/{id}/versions`
- `GET /api/docs/{id}/versions/{revision}`
- `POST /api/docs/{id}/restore/{revision}`

All endpoints require `users` authentication. Inaccessible private/project documents use not-found semantics where appropriate to avoid revealing record existence.

Personal folders use PocketBase `/api/collections/doc_folders/records` CRUD. Document location changes use the Docs move endpoint so private and project destinations share the same permission and relation-cleanup rules.

## 10. Assistant tools

- `docs_search`: searches visible active documents by title/content, optionally scoped to My documents, a personal folder, or a project, and returns metadata plus an excerpt; default 20, maximum 50.
- `docs_get`: returns complete current content, kind, revision, and project/folder location.
- `docs_list_folders`: lists the current user's personal folders so IDs can be resolved before creating or moving.
- `docs_upsert`: creates a document in My documents, a personal folder, or a project, or writes a complete replacement using `baseRevision`. Its `kind` is required; before creating, the Assistant briefly asks the user to choose simple, easily editable Markdown or rich, interactive HTML when no kind was specified.
- `docs_move`: only when explicitly requested, moves one to 50 creator-owned documents between My documents, existing personal folders, and editable projects through a required `items` array; a single move uses one item, and legacy top-level single-document input is rejected. Leaving a project automatically unlinks its tasks. Items execute in order with independent results.
- `docs_replace`: replaces the first or all exact Markdown matches using `baseRevision`.
- `docs_write_chunk`: writes oversized Markdown or HTML content in a replace/append sequence while recording one logical version.

The Assistant must call `docs_get` before updating, reuse the returned kind and revision, serialize mutations to the same document, and never overwrite a conflict. Successful AI changes create versions with source `ai`; unchanged upserts and unmatched replacements create no version.

## 11. Board integration

`board_tasks.documents` links up to 20 documents. The server accepts only documents whose `project` matches the task's project. The Board picker lists active project documents, task activity records title-based link changes, and deleting or moving a document out of a project automatically removes its task relations without deleting tasks.

## 12. Acceptance criteria

- Private and project documents follow the server-side access matrix.
- Creation and every changed explicit save create matching immutable revisions.
- No-op saves create no version, and stale saves cannot silently overwrite newer content.
- Realtime changes preserve dirty local drafts and refresh clean documents.
- BlockNote rich text/source, HTML source/sandbox preview, export, fullscreen, history preview, and restore operate on canonical kind-specific content.
- Search, pagination, per-user pins, archive, unarchive, and permanent deletion follow their limits and ownership rules.
- Personal folders use PocketBase CRUD; folder deletion and document moves neither delete documents nor increase revision.
- Attachment uploads enforce edit permission, media type, size, protected access, deduplication, and document cascade deletion.
- Chat document mutations obey permissions and optimistic concurrency.
- Chat can move a one-item or multi-item batch of up to 50 eligible documents, preserving ordered successes and failures.
- A document creator can move a document between private and editable project locations without changing its revision; leaving a project unlinks source-project tasks atomically.
- Board tasks accept only same-project document links and survive linked-document deletion.
