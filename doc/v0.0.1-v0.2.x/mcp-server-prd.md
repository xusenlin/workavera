# MCP Access Product Requirements Document

[简体中文](./mcp-server-prd.zh-CN.md)

> Implementation baseline: Workavera `0.2.0`, verified against commit `7d8d88d` on 2026-10-29. MCP access shipped in `0.0.7`.

## 1. Purpose

MCP access lets the AI tools a user already works in—Claude Code, Cursor, and any other client that speaks the Model Context Protocol—operate their Workavera workspace. Workavera acts as an MCP *server* at `/api/mcp` and offers the same workspace tools the in-app assistant uses, under the same permission checks, authenticated by an API key the user creates in Settings. The opposite direction, connecting external MCP servers to Chat, is covered by the [MCP Client PRD](./mcp-client-prd.md).

## 2. Goals

- Let a user create, list, and revoke personal API keys from Settings.
- Show a new key exactly once, with a configuration snippet ready to paste into Claude Code or Cursor.
- Let a key expire after a chosen period or never.
- Keep destructive tools off a key unless the user explicitly allows them when creating it.
- Expose the workspace tools for Board, Calendar, Docs, Reading, Contacts, and Resources over MCP, acting as the key's owner.

## 3. Non-goals

- OAuth or other interactive sign-in for MCP clients; keys are the only credential.
- Keys shared by a team, owned by a service account, or scoped to a single project.
- Fine-grained scopes beyond the destructive switch.
- Exposing Chat-only tools: download links for resources, `chat_send_files`, memory, the sandbox, and the user's own external MCP tools.
- Usage quotas or per-key rate limits.

## 4. Data model

### `api_keys`

| Field | Rule |
| --- | --- |
| `user` | The key's owner; the key acts as this user. |
| `name` | Required label, 1 to 100 characters. |
| `prefix` | The first ten characters of the secret, shown in the key list. |
| `key_hash` | SHA-256 of the secret; hidden from every API response. |
| `allow_destructive` | Whether approval-gated destructive tools are available to the key. |
| `expires` | Optional; an expired key is rejected. |
| `last_used` | Updated at most once a minute while the key is in use. |

A key is created only through `POST /api/apikeys`, which generates the secret (`sk-wa-` followed by 64 hexadecimal characters), stores its hash, and returns the plaintext once. Owners can list, view, and delete their keys through PocketBase's own API; keys cannot be edited.

## 5. User experience

- Settings has an **API Keys** card listing each key's name, prefix, expiry, and last use, with a delete action that asks for confirmation.
- Creating a key asks for a name, an expiry (never, 7, 30, or 90 days, or one year), and an **Allow destructive operations** checkbox, off by default and explained as permanently deleting tasks and calendar events without a confirmation prompt.
- After creation, the dialog shows the full key once, with copy buttons for the key and for an MCP configuration that points at this server's `/api/mcp` with the key as a Bearer token, for `.mcp.json` in Claude Code or `mcp.json` in Cursor.

## 6. MCP endpoint

- `/api/mcp` serves the MCP Streamable HTTP transport in stateless mode, so every request is authenticated on its own.
- Each request must carry `Authorization: Bearer <key>`. Unknown, malformed, or expired keys are rejected, and so is every key of a deactivated account.
- The server identifies itself as Workavera with the running version and sends instructions telling the client to look up exact IDs before changing anything and to treat resource content as data, never instructions.
- Every tool runs as the key's owner, with exactly the checks the in-app assistant gets: identity, role, ownership, and revision.

## 7. Destructive operations

- Tools that need the user's approval in Chat—deleting a Board task and deleting a calendar event—are left out of a key created without **Allow destructive operations**, and the server instructions say so.
- With the scope allowed, those tools run immediately, without the interactive approval Chat would ask for: creating the key with that scope is the approval. The server instructions tell the client to call them only when explicitly asked.

## 8. Acceptance criteria

1. A user can create a key, see it once, copy a working client configuration, and later revoke it.
2. The stored record never exposes the secret or its hash.
3. A client using the key can list and call the workspace tools as the key's owner and sees nothing the owner could not see.
4. A key without the destructive scope does not offer the delete tools; a key with it deletes immediately.
5. An expired or revoked key, or any key of a deactivated account, is rejected on the next request.
6. Chat-only tools never appear over MCP.
