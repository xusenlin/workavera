# Reading Product Requirements Document

[简体中文](./reading-prd.zh-CN.md)

> Implementation baseline: Workavera `0.2.0`, verified against commit `7d8d88d` on 2026-10-29. Reading shipped in `0.0.1`.

## 1. Purpose

Reading is Workavera's read-it-later layer. It keeps the links a user wants to come back to—articles, repositories, product pages—together with notes, tags, a read state, and an AI summary, and lets a link belong to a Board project so research stays next to the work it serves.

## 2. Goals

- Save, edit, archive, restore, and delete private reading items.
- Track each item as unread, read, or archived, and mark every unread item read at once.
- Organize items with free-form tags and an optional Board project.
- Pin up to six active items to the top of the list.
- Fetch an item's page and generate a summary with key points in a chosen language, using the user's default model.
- Let Chat search, read, save, update, and summarize reading items.

## 3. Non-goals

- Sharing reading items with other users or publishing them.
- Offline copies, screenshots, or PDFs of saved pages.
- Following links behind a login or rendering JavaScript-only pages.
- Highlights, annotations, or reading progress inside an article.

## 4. Data model

### `reading_items`

| Field | Rule |
| --- | --- |
| `owner` | Required relation to the user; set on create and never changed. |
| `url` | Required, up to 2,048 characters. |
| `title` | Required, up to 240 characters. |
| `description` | Optional note on why the link matters, up to 4,000 characters. |
| `tags` | Optional JSON list of strings. |
| `project` | Optional relation to a Board project. |
| `status` | `unread` (default), `read`, or `archived`. |
| `pinned` | Boolean; at most six pinned items that are not archived per owner. |
| `content_text` | Fetched or pasted article text, up to 256 KiB. |
| `summary` | AI or manual summary, up to 64 KiB. |
| `key_points` | JSON list of key points. |
| `summary_language` | Language the summary is written in, up to 100 characters. |

## 5. Behavior

- Adding an item needs a URL and a title. Description, tags, project, status, summary language, summary, key points, and content can be filled in by hand.
- Archiving an item unpins it. Archived items leave the main list and appear in a separate archive, where they can be restored or deleted.
- Pinning a seventh active item is refused with a clear message.
- "Mark all read" changes every unread item of the user to read in one transaction.
- Summarizing fetches the page (up to 1 MiB) and extracts readable text; for a GitHub repository page it reads the repository README instead of the page chrome. The text, summary, and key points are saved on the item. A summary needs a default model with an API key; when there is none, the user is told the article was fetched but could not be summarized.

## 6. User experience

- Reading lives at `/reading`, with the list on the left and the selected item's detail—summary, key points, and content—on the right.
- Pinned items sit above the rest, which are sorted by most recently updated. The list can be searched and filtered by status and project.
- An **Add link** dialog creates items, which can then be edited, pinned, archived, or deleted from the list and the detail view.
- Summarizing an item asks for confirmation first, because it fetches the page and calls the model.

## 7. Permissions

- Reading items are private: only their owner can list, view, create, update, or delete them, and the owner cannot be changed.
- An item cannot be created already pinned; pinning goes through the pin rule so the limit of six holds.
- Pages are fetched by the server with a `Workavera/1.0` user agent and a size limit, and only for URLs the user saved.

## 8. Assistant tools

### `reading_search`

Searches the user's items by title, URL, description, or tags, optionally filtered by status and project. Returns up to 20 results (10 by default) with summaries and key points, never the full text.

### `reading_get`

Returns one item by ID; the full article text is included only when asked for.

### `reading_upsert`

Creates or updates one to 50 items in a call. Creating needs a URL and a title; updating changes only the fields given. Used to save links, change status, edit titles, or update tags.

### `reading_summarize`

Fetches an item's page and generates a summary with the user's default model. An item that already has a summary returns it without fetching again.

The same tools are available to MCP clients through API keys; see the [MCP access PRD](./mcp-server-prd.md).

## 9. Acceptance criteria

1. A user can add, edit, archive, restore, and delete their own reading items, and no other user can see them.
2. Pinning a seventh active item fails, and archiving a pinned item unpins it.
3. "Mark all read" leaves no unread items for that user.
4. Summarizing a reachable article stores its text, summary, and key points in the chosen language; without a usable default model the user gets an explanatory error.
5. A GitHub repository link is summarized from its README.
6. Chat can find, read, save, update, and summarize reading items within the user's own list.

## 10. Related documents

- [Discover PRD](./discover-prd.md) for the subscription panel inside Reading, added in `0.1.1`.
- [MCP access PRD](./mcp-server-prd.md) for using the Reading tools from external clients.
- [Scheduled tasks PRD](../planned/scheduled-tasks-prd.md), a proposal that would fetch subscriptions on a schedule.
