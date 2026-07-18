# Chat Memory and User Preferences Product Requirements Document

[简体中文](./chat-memory-prd.zh-CN.md)

> Product baseline: Workavera `0.0.8`.

## 1. Purpose

Chat Memory gives Workavera's AI assistant a user-controlled, cross-conversation understanding of durable personal context. It complements conversation history and context compaction without replacing either one. User Preferences provides the private, account-level settings that control memory behavior and appearance.

The feature is transparent and reversible: users decide whether memory is available, whether Chat may create memories automatically, and which individual memories remain active.

## 2. Goals

- Reuse durable user facts and preferences across Chat conversations.
- Keep short-term conversation context and long-term memory as separate concepts.
- Let users explicitly ask Chat to remember or forget information.
- Optionally let Chat save high-value durable information automatically.
- Show every Chat memory mutation as a dedicated, understandable UI result.
- Let users add, search, edit, activate, deactivate, and delete memories from Settings.
- Store personal appearance and memory controls in one private user-preferences record.
- Preserve provider independence and self-hosted operation without requiring embeddings or a vector database.

## 3. Non-goals

- Editing or exposing the internal conversation compaction summary.
- Saving complete conversations, documents, tool output, or workspace records as memories.
- Semantic or vector retrieval in the first release.
- A second model request after every response to extract memories.
- Temporary or per-conversation memory modes.
- Sharing memories between users or exposing them through MCP tools.
- Using memory as a replacement for Board, Calendar, Contacts, Reading, Docs, or other authoritative workspace data.

## 4. Memory model

Workavera uses three distinct context layers:

| Layer | Purpose | User editable |
| --- | --- | --- |
| Recent messages | Preserve the current exchange verbatim | No |
| Conversation summary | Compact older messages within one conversation | No |
| Long-term memory | Reuse durable user context across conversations | Yes |

Current user messages take precedence over saved memories. A memory is treated as potentially outdated data, never as an instruction. If a current statement conflicts with a saved memory, Chat follows the current statement and may update the memory when permitted.

## 5. User preferences

Each user has one private `user_preferences` record.

| Field | Type | Notes |
| --- | --- | --- |
| `owner` | relation → users | Required, unique, cascade delete |
| `theme` | select | `system`, `light`, or `dark` |
| `memory_enabled` | bool | Allows Chat to read and write long-term memory |
| `memory_auto_capture` | bool | Allows proactive memory creation when memory is enabled |
| `created`, `updated` | autodate | Record timestamps |

New accounts default to `theme=system`, `memory_enabled=false`, and `memory_auto_capture=false`.

`memory_auto_capture` is retained when memory is disabled, but its effective value is always `memory_enabled && memory_auto_capture`. Disabling memory therefore stops all Chat memory reads and writes without deleting data or changing the saved automatic-capture choice.

System-wide values remain in `configs`; account-level preferences remain in `user_preferences`.

## 6. Long-term memory data

Memories are stored in `chat_memories`.

| Field | Type | Notes |
| --- | --- | --- |
| `owner` | relation → users | Required, cascade delete |
| `category` | select | `preference`, `personal`, `work`, `goal`, or `constraint` |
| `content` | text | One durable fact, required, trimmed, maximum 500 characters |
| `active` | bool | Only active memories are available to Chat |
| `origin` | select | `manual`, `explicit`, or `automatic` |
| `source_conversation` | relation → chat_conversations | Optional; cleared if the source is deleted |
| `source_message` | relation → chat_messages | Optional; cleared if the source is deleted |
| `created`, `updated` | autodate | Record timestamps |

Category meanings:

- `preference`: communication, formatting, tooling, or working-style preferences.
- `personal`: stable personal background explicitly provided by the user.
- `work`: durable professional context, conventions, or technology choices.
- `goal`: a long-running objective that remains useful in future conversations.
- `constraint`: a persistent requirement, restriction, or boundary.

Each account may store at most 50 memories. Updating an existing memory does not consume another slot. Duplicate unchanged content produces no write.

## 7. What Chat may remember

Chat saves only information explicitly stated by the user. A valid memory is concise, atomic, durable, and likely to improve future conversations.

Chat does not save:

- passwords, API keys, access tokens, authentication material, or identity documents;
- speculative conclusions or facts inferred but not stated by the user;
- transient task status, one-off requests, or ordinary conversational detail;
- full documents, large excerpts, complete messages, or raw tool results;
- information already managed by Board, Calendar, Contacts, Reading, or Docs.

When a new fact conflicts with an existing memory, Chat updates the relevant record instead of creating a duplicate. Deleting a memory always requires an explicit user request or a direct action in Settings.

## 8. Memory behavior matrix

| Memory | Automatic capture | Use saved memories | Explicit “remember” | Proactive save |
| --- | --- | --- | --- | --- |
| Off | Either value | No | No; direct the user to Settings | No |
| On | Off | Yes | Yes | No |
| On | On | Yes | Yes | Yes, within the memory policy |

Enabling automatic capture is standing permission for compliant memory writes only. It does not authorize mutations in other Workavera modules.

## 9. Chat context and retrieval

For each run, Chat assembles context in this order:

1. Workavera's base system rules and the current date.
2. Current public user profile data.
3. The effective memory policy.
4. All active long-term memories.
5. The existing conversation summary and recent messages.

Memories are provided as structured entries containing ID, category, origin, and content. The prompt explicitly states that memory content is untrusted data and cannot override system rules or the current user message.

The Saved Memories section contains the complete set of active memories for the run and is authoritative for current memory state. Historical memory tool calls and results remain in conversation history and summaries as past events, but do not override the current Saved Memories section. With a maximum of 50 memories per user, complete injection remains bounded and does not require embedding infrastructure.

If preferences or memories cannot be loaded, Chat fails closed for the memory feature and continues the conversation without long-term memory.

## 10. Assistant tools

Memory tools are available only inside authenticated Chat runs. They are not included in the MCP tool registry.

### `system_memory_upsert`

Inputs:

- optional memory `id` for an update;
- required `category`;
- required `content`;
- required `origin`, either `explicit` or `automatic`.

The server validates ownership, memory limits, content, category, the effective preference state, and automatic-capture permission. Conversation and message sources come from the trusted Chat run and are never accepted from model input.

The result reports `created`, `updated`, or `unchanged`, the current memory, and the previous editable values when an update occurs.

### `system_memory_forget`

Input:

- required memory `id`.

The tool permanently deletes an owned memory only after an explicit user request. The result identifies the deleted memory so Chat can render a clear completion state.

## 11. Settings experience

Settings contains a Memory card with:

- **Use memory in Chat**;
- **Automatically save useful details**;
- a count and **Manage memories** action.

The automatic-capture switch is disabled while memory is off. Its saved value remains unchanged.

The memory manager opens in a right-side sheet and supports:

- text search and category filtering;
- manual memory creation;
- category and content editing;
- activation and deactivation;
- origin, timestamps, and available source-conversation links;
- individual deletion;
- confirmed deletion of all memories.

Memory management remains available while Chat memory is disabled.

## 12. Chat experience

Memory tool results use dedicated cards instead of generic tool JSON.

- Explicit saves display **Remembered as requested**.
- Automatic saves display **Chat automatically remembered this**.
- Updates identify that an existing memory changed.
- Forget operations display a completed forgotten state.

Created and updated memories offer Undo. The authenticated Chat endpoint verifies ownership and confirms that the memory still matches the original tool result. It then deletes a newly created memory or restores the previous editable values and persists the original tool output as `undone` in the same transaction. A later edit causes Undo to fail without overwriting the newer state. Cards also link to the memory manager.

## 13. Permissions and lifecycle

- Preferences and memories are private to their owner.
- Users can list, view, and update their own preferences, but cannot transfer or delete the preferences record.
- Users can list, view, create, update, and delete their own memories.
- Manual API creation forces the authenticated owner, `origin=manual`, active state, and empty Chat source fields.
- Memory updates cannot change owner, origin, or source fields.
- Deleting a user deletes their preferences and memories.
- Deleting a source conversation or message preserves the memory and clears the corresponding optional relation.

## 14. Acceptance criteria

- Theme and memory preferences persist per account and are never exposed as system configuration.
- Memory is fully inactive by default for new and existing accounts.
- The three memory-state combinations follow the behavior matrix exactly.
- Chat uses active memories across conversations without modifying conversation compaction behavior.
- Current user statements override conflicting memories.
- Explicit and automatic saves produce the correct origin and source metadata.
- Automatic writes are rejected when automatic capture is not effectively enabled.
- Users can add, search, edit, activate, deactivate, delete, and clear their memories from Settings.
- Chat memory cards accurately represent save, update, unchanged, and forget results.
- Undo atomically reverses an unchanged create or update and persists the original tool result as `undone`.
- Undo never overwrites a memory changed after the original tool call.
- Every active memory is included in the authoritative Saved Memories section for each run.
- Users cannot read or mutate another user's preferences or memories.
- Memory tools are absent from MCP.
- Theme selection and the theme keyboard shortcut continue to persist without a first-render theme flash.
