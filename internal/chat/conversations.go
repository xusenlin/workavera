package chat

// Conversation CRUD is handled by PocketBase's built-in Records API.
// The chat_conversations collection has API rules set in the migration
// (1783346400_create_chat_collections.go) that enforce owner-scoped access,
// and an OnRecordCreateRequest hook in chat.go injects owner/status/title
// defaults on creation.
//
// The only custom routes remaining are:
//   - GET  /api/chat/conversations/{id}/messages  (listMessages — AI SDK format)
//   - POST /api/chat/stream                        (stream — SSE LLM orchestration)
//   - POST /api/chat/runs/{id}/stop                (stopRun — cancel active run)
