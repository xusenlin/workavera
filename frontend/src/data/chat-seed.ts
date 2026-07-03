import type { BlockTypeValue, Conversation, Message } from "@/types/chat"

const now = Date.now()
const min = 60_000
const hour = 60 * min
const day = 24 * hour

const iso = (offset: number) => new Date(now - offset).toISOString()

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export const seedConversations: Conversation[] = [
  {
    id: "conv_01HPXKQ3M1WZ4N8RKB2J5T6Y7A",
    title: "Refactor auth middleware with token refresh",
    modelId: "claude-sonnet-4-20250514",
    status: "active",
    pinned: true,
    messageCount: 6,
    toolCallCount: 2,
    totalTokens: 4280,
    inputTokens: 1850,
    outputTokens: 2430,
    createdAt: iso(2 * day),
    updatedAt: iso(20 * min),
  },
  {
    id: "conv_01HPXKQ3N2XJ5P9SLC3K6U7Z8B",
    title: "Design PostgreSQL migration plan for v2",
    modelId: "gpt-4o",
    status: "active",
    pinned: true,
    messageCount: 4,
    toolCallCount: 1,
    totalTokens: 3120,
    inputTokens: 1400,
    outputTokens: 1720,
    createdAt: iso(3 * day),
    updatedAt: iso(5 * hour),
  },
  {
    id: "conv_01HPXKQ3P3YK6Q0TMD4L7V8X9C",
    title: "How to use React Suspense with streaming data",
    modelId: "claude-sonnet-4-20250514",
    status: "active",
    pinned: false,
    messageCount: 3,
    toolCallCount: 0,
    totalTokens: 1980,
    inputTokens: 820,
    outputTokens: 1160,
    createdAt: iso(6 * hour),
    updatedAt: iso(40 * min),
  },
  {
    id: "conv_01HPXKQ3Q4ZL7R1UNE5M8W9Y0D",
    title: "Debug WebSocket connection drops in production",
    modelId: "gpt-4o-mini",
    status: "active",
    pinned: false,
    messageCount: 5,
    toolCallCount: 3,
    totalTokens: 5340,
    inputTokens: 2300,
    outputTokens: 3040,
    createdAt: iso(1 * day),
    updatedAt: iso(2 * hour),
  },
  {
    id: "conv_01HPXKQ3R5AM8S2VOf6N9X0Z1E",
    title: "Write unit tests for the board store",
    modelId: "claude-sonnet-4-20250514",
    status: "active",
    pinned: false,
    messageCount: 4,
    toolCallCount: 1,
    totalTokens: 2760,
    inputTokens: 1180,
    outputTokens: 1580,
    createdAt: iso(2 * day),
    updatedAt: iso(8 * hour),
  },
  {
    id: "conv_01HPXKQ3S6BN9T3WPG7O0Y1A2F",
    title: "Optimize Vite build and reduce bundle size",
    modelId: "gpt-4o",
    status: "active",
    pinned: false,
    messageCount: 2,
    toolCallCount: 0,
    totalTokens: 1340,
    inputTokens: 560,
    outputTokens: 780,
    createdAt: iso(3 * day),
    updatedAt: iso(1 * day),
  },
  {
    id: "conv_01HPXKQ3T7CO0U4XQH8P1Z2B3G",
    title: "Review Tailwind v4 migration guide",
    modelId: "claude-sonnet-4-20250514",
    status: "active",
    pinned: false,
    messageCount: 3,
    toolCallCount: 0,
    totalTokens: 1620,
    inputTokens: 700,
    outputTokens: 920,
    createdAt: iso(4 * day),
    updatedAt: iso(3 * day),
  },
  {
    id: "conv_01HPXKQ3U8DP1V5YRIO9Q2A3C4H",
    title: "Set up Grafana dashboards for API latency",
    modelId: "gpt-4o-mini",
    status: "active",
    pinned: false,
    messageCount: 2,
    toolCallCount: 1,
    totalTokens: 1480,
    inputTokens: 640,
    outputTokens: 840,
    createdAt: iso(5 * day),
    updatedAt: iso(4 * day),
  },
  {
    id: "conv_01HPXKQ3V9EQ2W6ZSJP0R3B4D5I",
    title: "Kanban drag-and-drop implementation notes",
    modelId: "gpt-4o",
    status: "archived",
    pinned: false,
    messageCount: 3,
    toolCallCount: 0,
    totalTokens: 1860,
    inputTokens: 800,
    outputTokens: 1060,
    createdAt: iso(7 * day),
    updatedAt: iso(6 * day),
  },
  {
    id: "conv_01HPXKQ3W0FR3X7ATJQ1S4C5E6J",
    title: "Draft API documentation for v2 endpoints",
    modelId: "claude-sonnet-4-20250514",
    status: "archived",
    pinned: false,
    messageCount: 4,
    toolCallCount: 2,
    totalTokens: 3240,
    inputTokens: 1450,
    outputTokens: 1790,
    createdAt: iso(10 * day),
    updatedAt: iso(8 * day),
  },
]

// ---------------------------------------------------------------------------
// Messages with blocks — keyed by conversation id
// ---------------------------------------------------------------------------

function blk(
  messageId: string,
  index: number,
  partial: Partial<{
    blockType: string
    content: string
    toolUseId: string
    toolName: string
    toolInput: string
    toolResult: string
    isError: boolean
  }>
) {
  return {
    id: `blk_${messageId}_${index}`,
    messageId,
    blockType: (partial.blockType ?? "text") as BlockTypeValue,
    sequenceOrder: index,
    content: partial.content ?? "",
    toolUseId: partial.toolUseId ?? "",
    toolName: partial.toolName ?? "",
    toolInput: partial.toolInput ?? "",
    toolResult: partial.toolResult ?? "",
    isError: partial.isError ?? false,
    createdAt: iso(0),
    updatedAt: iso(0),
  }
}

export const seedMessages: Record<string, Message[]> = {
  // --- Conv 1: Refactor auth middleware ------------------------------------
  "conv_01HPXKQ3M1WZ4N8RKB2J5T6Y7A": [
    {
      id: "msg_1_1",
      conversationId: "conv_01HPXKQ3M1WZ4N8RKB2J5T6Y7A",
      role: "user",
      modelName: "",
      inputTokens: 0,
      outputTokens: 0,
      createdAt: iso(2 * day),
      updatedAt: iso(2 * day),
      status: "complete",
      sequenceOrder: 0,
      blocks: [
        blk("msg_1_1", 0, {
          content:
            "I need to refactor our auth middleware. The token refresh logic is getting tangled — can you help me structure it better?",
        }),
      ],
    },
    {
      id: "msg_1_2",
      conversationId: "conv_01HPXKQ3M1WZ4N8RKB2J5T6Y7A",
      role: "assistant",
      modelName: "claude-sonnet-4-20250514",
      inputTokens: 320,
      outputTokens: 680,
      createdAt: iso(2 * day - 5 * min),
      updatedAt: iso(2 * day - 3 * min),
      status: "complete",
      sequenceOrder: 1,
      blocks: [
        blk("msg_1_2", 0, {
          blockType: "thinking",
          content:
            "The user wants to refactor auth middleware. Let me first look at the current implementation to understand the structure before suggesting changes. I should check the middleware directory and identify where token refresh is handled.",
        }),
        blk("msg_1_2", 1, {
          blockType: "tool_use",
          toolUseId: "tool_1_a",
          toolName: "read_file",
          toolInput: JSON.stringify({ path: "src/middleware/auth.ts" }, null, 2),
        }),
        blk("msg_1_2", 2, {
          blockType: "tool_result",
          toolUseId: "tool_1_a",
          toolResult: JSON.stringify(
            {
              content:
                "export function authMiddleware(req, res, next) {\n  const token = req.headers.authorization;\n  if (!token) return res.status(401).send('Unauthorized');\n  // ... refresh logic mixed in here\n}",
              lines: 42,
            },
            null,
            2
          ),
        }),
        blk("msg_1_2", 3, {
          content:
            "I've reviewed your current `auth.ts` middleware. Here's the issue: **token refresh logic is mixed directly into the request handler**, making it hard to test and reuse.\n\nI'd suggest splitting it into three concerns:\n\n1. **Token verification** — a pure function that validates a JWT\n2. **Refresh strategy** — a separate module that handles expiry detection and refresh\n3. **Middleware composition** — wires them together\n\n```ts\n// verifyToken.ts\nexport function verifyToken(token: string): Claims | null { ... }\n\n// refreshToken.ts\nexport async function refreshTokenIfNeeded(claims: Claims): Promise<Claims> { ... }\n\n// auth.ts — now thin and testable\nexport async function authMiddleware(req, res, next) {\n  const claims = verifyToken(extractToken(req))\n  if (!claims) return res.status(401).send('Unauthorized')\n  req.user = await refreshTokenIfNeeded(claims)\n  next()\n}\n```\n\nWant me to generate the full implementation for each file?",
        }),
      ],
    },
    {
      id: "msg_1_3",
      conversationId: "conv_01HPXKQ3M1WZ4N8RKB2J5T6Y7A",
      role: "user",
      modelName: "",
      inputTokens: 0,
      outputTokens: 0,
      createdAt: iso(2 * day - 2 * min),
      updatedAt: iso(2 * day - 2 * min),
      status: "complete",
      sequenceOrder: 2,
      blocks: [
        blk("msg_1_3", 0, {
          content: "Yes, please generate all three files. Also include unit tests.",
        }),
      ],
    },
    {
      id: "msg_1_4",
      conversationId: "conv_01HPXKQ3M1WZ4N8RKB2J5T6Y7A",
      role: "assistant",
      modelName: "claude-sonnet-4-20250514",
      inputTokens: 480,
      outputTokens: 1120,
      createdAt: iso(20 * min + 2 * min),
      updatedAt: iso(20 * min),
      status: "complete",
      sequenceOrder: 3,
      blocks: [
        blk("msg_1_4", 0, {
          blockType: "thinking",
          content:
            "Generating three files plus tests. I'll start with verifyToken since it has no dependencies, then refreshToken which depends on verifyToken, then the middleware itself. Tests should mock the JWT library.",
        }),
        blk("msg_1_4", 1, {
          content:
            "Here's the complete implementation:\n\n### `verifyToken.ts`\n\n```ts\nimport jwt from 'jsonwebtoken'\n\nexport interface Claims {\n  sub: string\n  exp: number\n  iat: number\n}\n\nexport function verifyToken(token: string): Claims | null {\n  try {\n    return jwt.verify(token, process.env.JWT_SECRET!) as Claims\n  } catch {\n    return null\n  }\n}\n```\n\n### `refreshToken.ts`\n\n```ts\nimport { verifyToken, type Claims } from './verifyToken'\n\nconst REFRESH_THRESHOLD_MS = 5 * 60 * 1000 // 5 min before expiry\n\nexport async function refreshTokenIfNeeded(claims: Claims): Promise<Claims> {\n  const expiresAt = claims.exp * 1000\n  if (expiresAt - Date.now() > REFRESH_THRESHOLD_MS) return claims\n  // Call your refresh endpoint and return new claims\n  return refreshWithRefreshToken(claims.sub)\n}\n```\n\nI'll skip the middleware and tests for brevity — shall I continue with those?",
        }),
      ],
    },
  ],

  // --- Conv 2: PostgreSQL migration plan -----------------------------------
  "conv_01HPXKQ3N2XJ5P9SLC3K6U7Z8B": [
    {
      id: "msg_2_1",
      conversationId: "conv_01HPXKQ3N2XJ5P9SLC3K6U7Z8B",
      role: "user",
      modelName: "",
      inputTokens: 0,
      outputTokens: 0,
      createdAt: iso(3 * day),
      updatedAt: iso(3 * day),
      status: "complete",
      sequenceOrder: 0,
      blocks: [
        blk("msg_2_1", 0, {
          content:
            "We're migrating from PostgreSQL 14 to 16. What are the key breaking changes I should watch for?",
        }),
      ],
    },
    {
      id: "msg_2_2",
      conversationId: "conv_01HPXKQ3N2XJ5P9SLC3K6U7Z8B",
      role: "assistant",
      modelName: "gpt-4o",
      inputTokens: 260,
      outputTokens: 540,
      createdAt: iso(3 * day - 4 * min),
      updatedAt: iso(3 * day - 2 * min),
      status: "complete",
      sequenceOrder: 1,
      blocks: [
        blk("msg_2_2", 0, {
          content:
            "Here are the main breaking changes from PostgreSQL 14 → 16:\n\n| Area | Change | Impact |\n|------|--------|--------|\n| **Authentication** | `scram-sha-256` is now the default | Old clients using `md5` need updating |\n| **Logical replication** | New `binary` option | Existing subscriptions may need reconfiguration |\n| **JSON** | `jsonb_path_query` behavior change | Query results may differ |\n| **Stats** | `pg_stat_activity` columns renamed | Monitoring queries need updates |\n\n**Recommended migration steps:**\n\n1. Test your app against PG 16 in staging first\n2. Review all custom SQL for deprecated functions\n3. Update connection strings if using `md5` auth\n4. Run `pg_upgrade` with `--check` mode to detect issues\n\nWould you like a detailed checklist for the `pg_upgrade` process?",
        }),
      ],
    },
    {
      id: "msg_2_3",
      conversationId: "conv_01HPXKQ3N2XJ5P9SLC3K6U7Z8B",
      role: "user",
      modelName: "",
      inputTokens: 0,
      outputTokens: 0,
      createdAt: iso(5 * hour + 2 * min),
      updatedAt: iso(5 * hour + 2 * min),
      status: "complete",
      sequenceOrder: 2,
      blocks: [
        blk("msg_2_3", 0, {
          content: "Yes, and also check our current schema for compatibility issues.",
        }),
      ],
    },
    {
      id: "msg_2_4",
      conversationId: "conv_01HPXKQ3N2XJ5P9SLC3K6U7Z8B",
      role: "assistant",
      modelName: "gpt-4o",
      inputTokens: 420,
      outputTokens: 780,
      createdAt: iso(5 * hour + 1 * min),
      updatedAt: iso(5 * hour),
      status: "complete",
      sequenceOrder: 3,
      blocks: [
        blk("msg_2_4", 0, {
          blockType: "tool_use",
          toolUseId: "tool_2_a",
          toolName: "query_database",
          toolInput: JSON.stringify(
            {
              query:
                "SELECT version(), current_setting('password_encryption') as auth_method;",
              database: "workavera_prod",
            },
            null,
            2
          ),
        }),
        blk("msg_2_4", 1, {
          blockType: "tool_result",
          toolUseId: "tool_2_a",
          toolResult: JSON.stringify(
            {
              version: "PostgreSQL 14.12",
              auth_method: "md5",
            },
            null,
            2
          ),
        }),
        blk("msg_2_4", 2, {
          content:
            "I checked your production database. You're currently on **PostgreSQL 14.12** using `md5` authentication.\n\n⚠️ **Critical action required:** You'll need to migrate all user passwords to `scram-sha-256` before upgrading. Here's the process:\n\n```sql\n-- Step 1: Set the new encryption method\nALTER SYSTEM SET password_encryption = 'scram-sha-256';\nSELECT pg_reload_conf();\n\n-- Step 2: Re-encrypt all passwords (users must reset or you re-hash)\n-- This must be done per-role:\nALTER ROLE your_app_user PASSWORD 'newpassword';\n```\n\n### Full pg_upgrade checklist:\n\n1. **Backup** — `pg_dumpall > backup.sql`\n2. **Install PG 16** — alongside PG 14\n3. **Initialize** — `initdb` the new data directory\n4. **Run check** — `pg_upgrade --check`\n5. **Upgrade** — `pg_upgrade`\n6. **Verify** — run your test suite against the new cluster\n7. **Switch** — update connection strings and restart app\n\nShall I generate a shell script that automates steps 2–5?",
        }),
      ],
    },
  ],

  // --- Conv 3: React Suspense ----------------------------------------------
  "conv_01HPXKQ3P3YK6Q0TMD4L7V8X9C": [
    {
      id: "msg_3_1",
      conversationId: "conv_01HPXKQ3P3YK6Q0TMD4L7V8X9C",
      role: "user",
      modelName: "",
      inputTokens: 0,
      outputTokens: 0,
      createdAt: iso(6 * hour),
      updatedAt: iso(6 * hour),
      status: "complete",
      sequenceOrder: 0,
      blocks: [
        blk("msg_3_1", 0, {
          content:
            "How does React Suspense work with streaming data from the server? Can you show a simple example?",
        }),
      ],
    },
    {
      id: "msg_3_2",
      conversationId: "conv_01HPXKQ3P3YK6Q0TMD4L7V8X9C",
      role: "assistant",
      modelName: "claude-sonnet-4-20250514",
      inputTokens: 200,
      outputTokens: 680,
      createdAt: iso(6 * hour - 3 * min),
      updatedAt: iso(6 * hour - 1 * min),
      status: "complete",
      sequenceOrder: 1,
      blocks: [
        blk("msg_3_2", 0, {
          content:
            "React Suspense works with streaming data by letting a component \"suspend\" while waiting for async data. React shows a fallback (like a spinner) and resumes when the data resolves.\n\n### Basic pattern\n\n```tsx\n// A resource that caches a promise\nfunction createResource<T>(promise: Promise<T>) {\n  let status = 'pending'\n  let result: T\n  const suspender = promise.then(\n    (r) => { status = 'success'; result = r },\n    (e) => { status = 'error'; result = e }\n  )\n  return {\n    read() {\n      if (status === 'pending') throw suspender\n      if (status === 'error') throw result\n      return result\n    }\n  }\n}\n\n// Usage\nconst dataResource = createResource(fetch('/api/data').then(r => r.json()))\n\nfunction DataDisplay() {\n  const data = dataResource.read() // suspends here\n  return <div>{data.title}</div>\n}\n\nfunction App() {\n  return (\n    <Suspense fallback={<Spinner />}>\n      <DataDisplay />\n    </Suspense>\n  )\n}\n```\n\n**Key points:**\n\n- The `read()` call throws a promise when data isn't ready\n- Suspense catches that promise and shows the fallback\n- When the promise resolves, React re-renders the component\n- This works naturally with streaming (ReadableStream / SSE)\n\nFor the AI SDK specifically, the `useChat` hook handles this internally — it manages the streaming state so you don't need to implement the resource pattern yourself.",
        }),
      ],
    },
    {
      id: "msg_3_3",
      conversationId: "conv_01HPXKQ3P3YK6Q0TMD4L7V8X9C",
      role: "user",
      modelName: "",
      inputTokens: 0,
      outputTokens: 0,
      createdAt: iso(40 * min),
      updatedAt: iso(40 * min),
      status: "complete",
      sequenceOrder: 2,
      blocks: [
        blk("msg_3_3", 0, {
          content: "That's helpful. How would I handle errors in this pattern?",
        }),
      ],
    },
  ],

  // --- Conv 4: WebSocket debug ---------------------------------------------
  "conv_01HPXKQ3Q4ZL7R1UNE5M8W9Y0D": [
    {
      id: "msg_4_1",
      conversationId: "conv_01HPXKQ3Q4ZL7R1UNE5M8W9Y0D",
      role: "user",
      modelName: "",
      inputTokens: 0,
      outputTokens: 0,
      createdAt: iso(1 * day),
      updatedAt: iso(1 * day),
      status: "complete",
      sequenceOrder: 0,
      blocks: [
        blk("msg_4_1", 0, {
          content:
            "Our WebSocket connections keep dropping in production after about 30 seconds. The logs show a 1006 close code. Any ideas?",
        }),
      ],
    },
    {
      id: "msg_4_2",
      conversationId: "conv_01HPXKQ3Q4ZL7R1UNE5M8W9Y0D",
      role: "assistant",
      modelName: "gpt-4o-mini",
      inputTokens: 280,
      outputTokens: 620,
      createdAt: iso(1 * day - 3 * min),
      updatedAt: iso(1 * day - 1 * min),
      status: "complete",
      sequenceOrder: 1,
      blocks: [
        blk("msg_4_2", 0, {
          blockType: "thinking",
          content:
            "Close code 1006 means the connection was closed abnormally (no close frame received). The ~30 second timeout strongly suggests an intermediary (load balancer, proxy, or firewall) is killing idle connections. Common culprits: AWS ALB idle timeout (default 60s), nginx proxy_read_timeout (default 60s), or Cloudflare. But 30s is unusual — could be a custom config. I should also check if they have ping/pong heartbeat implemented.",
        }),
        blk("msg_4_2", 1, {
          content:
            "Close code **1006** means the connection was closed abnormally — no close frame was received. The ~30 second pattern strongly suggests an **intermediary is killing idle connections**.\n\n### Likely culprits\n\n1. **Load balancer idle timeout** — AWS ALB defaults to 60s, but custom configs can set 30s\n2. **Nginx `proxy_read_timeout`** — defaults to 60s\n3. **Cloudflare** — free tier has a 100s limit, but enterprise can be lower\n\n### Fix: implement a heartbeat\n\n```js\n// Client-side ping/pong\nconst ws = new WebSocket('wss://api.example.com/ws')\nlet pingInterval\n\nws.onopen = () => {\n  pingInterval = setInterval(() => {\n    if (ws.readyState === WebSocket.OPEN) {\n      ws.send(JSON.stringify({ type: 'ping' }))\n    }\n  }, 25_000) // send before the 30s timeout\n}\n\nws.onclose = () => clearInterval(pingInterval)\n```\n\n```js\n// Server-side pong handler\nws.on('message', (msg) => {\n  const data = JSON.parse(msg)\n  if (data.type === 'ping') {\n    ws.send(JSON.stringify({ type: 'pong' }))\n  }\n})\n```\n\nAlso add **auto-reconnect** logic with exponential backoff. Want me to check your nginx config?",
        }),
      ],
    },
    {
      id: "msg_4_3",
      conversationId: "conv_01HPXKQ3Q4ZL7R1UNE5M8W9Y0D",
      role: "user",
      modelName: "",
      inputTokens: 0,
      outputTokens: 0,
      createdAt: iso(2 * hour + 5 * min),
      updatedAt: iso(2 * hour + 5 * min),
      status: "complete",
      sequenceOrder: 2,
      blocks: [
        blk("msg_4_3", 0, { content: "Yes, please check the nginx config." }),
      ],
    },
    {
      id: "msg_4_4",
      conversationId: "conv_01HPXKQ3Q4ZL7R1UNE5M8W9Y0D",
      role: "assistant",
      modelName: "gpt-4o-mini",
      inputTokens: 350,
      outputTokens: 720,
      createdAt: iso(2 * hour + 4 * min),
      updatedAt: iso(2 * hour + 3 * min),
      status: "complete",
      sequenceOrder: 3,
      blocks: [
        blk("msg_4_4", 0, {
          blockType: "tool_use",
          toolUseId: "tool_4_a",
          toolName: "read_file",
          toolInput: JSON.stringify(
            { path: "/etc/nginx/sites-enabled/api.example.com" },
            null,
            2
          ),
        }),
        blk("msg_4_4", 1, {
          blockType: "tool_result",
          toolUseId: "tool_4_a",
          toolResult: JSON.stringify(
            {
              content:
                "location /ws {\n  proxy_pass http://backend;\n  proxy_http_version 1.1;\n  proxy_set_header Upgrade $http_upgrade;\n  proxy_set_header Connection \"upgrade\";\n  # Missing: proxy_read_timeout\n}",
            },
            null,
            2
          ),
        }),
        blk("msg_4_4", 2, {
          content:
            "Found it! Your nginx config is **missing `proxy_read_timeout`** for the WebSocket location block. Without it, nginx uses the default 60s, but your backend is likely closing sooner.\n\n```nginx\nlocation /ws {\n  proxy_pass http://backend;\n  proxy_http_version 1.1;\n  proxy_set_header Upgrade $http_upgrade;\n  proxy_set_header Connection \"upgrade\";\n\n  # Add these lines:\n  proxy_read_timeout 86400s;  # 24 hours\n  proxy_send_timeout 86400s;\n}\n```\n\nAfter updating, run `nginx -t` to validate and `nginx -s reload`.\n\nCombined with the heartbeat from before, this should fully resolve the drops.",
        }),
      ],
    },
    {
      id: "msg_4_5",
      conversationId: "conv_01HPXKQ3Q4ZL7R1UNE5M8W9Y0D",
      role: "user",
      modelName: "",
      inputTokens: 0,
      outputTokens: 0,
      createdAt: iso(2 * hour),
      updatedAt: iso(2 * hour),
      status: "complete",
      sequenceOrder: 4,
      blocks: [
        blk("msg_4_5", 0, {
          content: "Perfect, that fixed it! The connections are stable now.",
        }),
      ],
    },
  ],

  // --- Conv 5: Unit tests for board store ----------------------------------
  "conv_01HPXKQ3R5AM8S2VOf6N9X0Z1E": [
    {
      id: "msg_5_1",
      conversationId: "conv_01HPXKQ3R5AM8S2VOf6N9X0Z1E",
      role: "user",
      modelName: "",
      inputTokens: 0,
      outputTokens: 0,
      createdAt: iso(2 * day),
      updatedAt: iso(2 * day),
      status: "complete",
      sequenceOrder: 0,
      blocks: [
        blk("msg_5_1", 0, {
          content:
            "I have a Zustand store for a Kanban board. Can you write unit tests for the moveTodo function? It handles drag-and-drop reordering.",
        }),
      ],
    },
    {
      id: "msg_5_2",
      conversationId: "conv_01HPXKQ3R5AM8S2VOf6N9X0Z1E",
      role: "assistant",
      modelName: "claude-sonnet-4-20250514",
      inputTokens: 300,
      outputTokens: 880,
      createdAt: iso(2 * day - 3 * min),
      updatedAt: iso(2 * day - 1 * min),
      status: "complete",
      sequenceOrder: 1,
      blocks: [
        blk("msg_5_2", 0, {
          blockType: "tool_use",
          toolUseId: "tool_5_a",
          toolName: "search_codebase",
          toolInput: JSON.stringify(
            { query: "moveTodo", glob: "src/store/board.ts" },
            null,
            2
          ),
        }),
        blk("msg_5_2", 1, {
          blockType: "tool_result",
          toolUseId: "tool_5_a",
          toolResult: JSON.stringify(
            {
              matches: 3,
              snippet:
                "moveTodo: (id, toStatus, toIndex) => set((state) => { ... })",
            },
            null,
            2
          ),
        }),
        blk("msg_5_2", 2, {
          content:
            "Here are comprehensive unit tests for `moveTodo` using Vitest:\n\n```ts\nimport { describe, it, expect, beforeEach } from 'vitest'\nimport { useBoardStore } from './board'\n\ndescribe('moveTodo', () => {\n  beforeEach(() => useBoardStore.setState({ todos: [], projects: [] }))\n\n  it('moves a todo to an empty column', () => {\n    const { addTodo, moveTodo, todos } = useBoardStore.getState()\n    addTodo({ projectId: 'p1', status: 'todo', title: 'Task', /* ... */ })\n    moveTodo('todo_1', 'done', 0)\n    expect(todos().find(t => t.id === 'todo_1')?.status).toBe('done')\n  })\n\n  it('reorders within the same column', () => {\n    // ... test reordering logic\n  })\n\n  it('preserves order of other todos', () => {\n    // ... test that non-moved todos keep their relative order\n  })\n})\n```\n\nWant me to flesh out all the test cases?",
        }),
      ],
    },
  ],

  // --- Conv 6: Optimize Vite build -----------------------------------------
  "conv_01HPXKQ3S6BN9T3WPG7O0Y1A2F": [
    {
      id: "msg_6_1",
      conversationId: "conv_01HPXKQ3S6BN9T3WPG7O0Y1A2F",
      role: "user",
      modelName: "",
      inputTokens: 0,
      outputTokens: 0,
      createdAt: iso(3 * day),
      updatedAt: iso(3 * day),
      status: "complete",
      sequenceOrder: 0,
      blocks: [
        blk("msg_6_1", 0, {
          content:
            "My Vite build outputs a 1.6MB JS bundle. How can I reduce this?",
        }),
      ],
    },
    {
      id: "msg_6_2",
      conversationId: "conv_01HPXKQ3S6BN9T3WPG7O0Y1A2F",
      role: "assistant",
      modelName: "gpt-4o",
      inputTokens: 220,
      outputTokens: 560,
      createdAt: iso(1 * day + 2 * min),
      updatedAt: iso(1 * day),
      status: "complete",
      sequenceOrder: 1,
      blocks: [
        blk("msg_6_2", 0, {
          content:
            "A 1.6MB bundle is common with rich dependencies. Here's a prioritized plan:\n\n### 1. Analyze first\n```bash\npnpm add -D rollup-plugin-visualizer\n```\nAdd the plugin to see exactly what's taking space.\n\n### 2. Code-split with lazy routes\n```ts\nconst SettingsPage = lazy(() => import('./pages/settings'))\n```\n\n### 3. Audit heavy deps\nCommon offenders:\n- `shiki` (syntax highlighting) — ~500KB, use dynamic import\n- `@dnd-kit/*` — tree-shakeable but check usage\n- Font subsets — only load needed `@fontsource` weights\n\n### 4. Configure manual chunks\n```ts\nbuild: {\n  rollupOptions: {\n    output: {\n      manualChunks: {\n        'vendor-react': ['react', 'react-dom', 'react-router'],\n        'vendor-ui': ['radix-ui', 'tailwind-merge', 'clsx'],\n      }\n    }\n  }\n}\n```\n\nStart with the visualizer — it'll tell you exactly where the bytes are.",
        }),
      ],
    },
  ],

  // --- Conv 7: Tailwind v4 migration ---------------------------------------
  "conv_01HPXKQ3T7CO0U4XQH8P1Z2B3G": [
    {
      id: "msg_7_1",
      conversationId: "conv_01HPXKQ3T7CO0U4XQH8P1Z2B3G",
      role: "user",
      modelName: "",
      inputTokens: 0,
      outputTokens: 0,
      createdAt: iso(4 * day),
      updatedAt: iso(4 * day),
      status: "complete",
      sequenceOrder: 0,
      blocks: [
        blk("msg_7_1", 0, {
          content:
            "What changed in Tailwind CSS v4? Do I need to update my config?",
        }),
      ],
    },
    {
      id: "msg_7_2",
      conversationId: "conv_01HPXKQ3T7CO0U4XQH8P1Z2B3G",
      role: "assistant",
      modelName: "claude-sonnet-4-20250514",
      inputTokens: 180,
      outputTokens: 520,
      createdAt: iso(4 * day - 2 * min),
      updatedAt: iso(4 * day - 1 * min),
      status: "complete",
      sequenceOrder: 1,
      blocks: [
        blk("msg_7_2", 0, {
          content:
            "Tailwind v4 is a major rewrite. Key changes:\n\n### No more `tailwind.config.js`\nConfiguration is now CSS-first using `@theme`:\n```css\n@import \"tailwindcss\";\n\n@theme {\n  --color-brand: oklch(0.5 0.2 250);\n  --font-sans: \"Inter\", sans-serif;\n}\n```\n\n### New engine\n- **Oxide engine** — written in Rust, 10x faster builds\n- **Automatic content detection** — no more `content: []` config\n- **Native CSS nesting** — no PostCSS plugin needed\n\n### Breaking changes\n- `@apply` works differently with custom utilities\n- Some plugin APIs changed\n- Dark mode uses `@custom-variant` instead of `darkMode` config\n- Default border color changed from `gray-200` to `currentColor`\n\nYour project already uses v4 (I can see `@theme inline` in your CSS), so you're all set!",
        }),
      ],
    },
    {
      id: "msg_7_3",
      conversationId: "conv_01HPXKQ3T7CO0U4XQH8P1Z2B3G",
      role: "user",
      modelName: "",
      inputTokens: 0,
      outputTokens: 0,
      createdAt: iso(3 * day),
      updatedAt: iso(3 * day),
      status: "complete",
      sequenceOrder: 2,
      blocks: [
        blk("msg_7_3", 0, {
          content: "How do I define custom utility classes in v4?",
        }),
      ],
    },
  ],

  // --- Conv 8: Grafana dashboards ------------------------------------------
  "conv_01HPXKQ3U8DP1V5YRIO9Q2A3C4H": [
    {
      id: "msg_8_1",
      conversationId: "conv_01HPXKQ3U8DP1V5YRIO9Q2A3C4H",
      role: "user",
      modelName: "",
      inputTokens: 0,
      outputTokens: 0,
      createdAt: iso(5 * day),
      updatedAt: iso(5 * day),
      status: "complete",
      sequenceOrder: 0,
      blocks: [
        blk("msg_8_1", 0, {
          content:
            "I need to set up Grafana dashboards to monitor API latency. What metrics should I track?",
        }),
      ],
    },
    {
      id: "msg_8_2",
      conversationId: "conv_01HPXKQ3U8DP1V5YRIO9Q2A3C4H",
      role: "assistant",
      modelName: "gpt-4o-mini",
      inputTokens: 240,
      outputTokens: 600,
      createdAt: iso(4 * day + 2 * min),
      updatedAt: iso(4 * day),
      status: "complete",
      sequenceOrder: 1,
      blocks: [
        blk("msg_8_2", 0, {
          blockType: "tool_use",
          toolUseId: "tool_8_a",
          toolName: "query_database",
          toolInput: JSON.stringify(
            {
              query:
                "SELECT endpoint, AVG(latency_ms) as avg, PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) as p99 FROM api_metrics GROUP BY endpoint ORDER BY p99 DESC LIMIT 10;",
              database: "metrics_db",
            },
            null,
            2
          ),
        }),
        blk("msg_8_2", 1, {
          blockType: "tool_result",
          toolUseId: "tool_8_a",
          isError: true,
          toolResult: JSON.stringify(
            {
              error: "relation 'api_metrics' does not exist",
              hint: "You need to create the metrics table first or connect a Prometheus data source.",
            },
            null,
            2
          ),
        }),
        blk("msg_8_2", 2, {
          content:
            "It looks like you don't have an `api_metrics` table yet. For Grafana, I'd recommend using **Prometheus** as your data source rather than a SQL database.\n\n### Essential metrics to track\n\n| Metric | Type | Why |\n|--------|------|-----|\n| `http_request_duration_seconds` | Histogram | Latency percentiles (p50, p95, p99) |\n| `http_requests_total` | Counter | Request volume & error rate |\n| `http_inflight_requests` | Gauge | Current concurrency |\n| `process_cpu_seconds_total` | Counter | CPU usage |\n\n### Recommended dashboard panels\n\n1. **p99 latency by endpoint** — time series\n2. **Request rate (req/s)** — time series\n3. **Error rate (5xx %)** — stat panel with threshold\n4. **Latency heatmap** — shows distribution over time\n5. **Top 10 slowest endpoints** — table\n\nWant me to generate the Prometheus recording rules and a Grafana dashboard JSON?",
        }),
      ],
    },
  ],

  // --- Conv 9: Kanban DnD (archived) ---------------------------------------
  "conv_01HPXKQ3V9EQ2W6ZSJP0R3B4D5I": [
    {
      id: "msg_9_1",
      conversationId: "conv_01HPXKQ3V9EQ2W6ZSJP0R3B4D5I",
      role: "user",
      modelName: "",
      inputTokens: 0,
      outputTokens: 0,
      createdAt: iso(7 * day),
      updatedAt: iso(7 * day),
      status: "complete",
      sequenceOrder: 0,
      blocks: [
        blk("msg_9_1", 0, {
          content: "What's the best library for drag-and-drop in React?",
        }),
      ],
    },
    {
      id: "msg_9_2",
      conversationId: "conv_01HPXKQ3V9EQ2W6ZSJP0R3B4D5I",
      role: "assistant",
      modelName: "gpt-4o",
      inputTokens: 160,
      outputTokens: 440,
      createdAt: iso(7 * day - 2 * min),
      updatedAt: iso(7 * day - 1 * min),
      status: "complete",
      sequenceOrder: 1,
      blocks: [
        blk("msg_9_2", 0, {
          content:
            "For React, **@dnd-kit** is the best choice right now:\n\n- **Modern API** — hooks-based, fully typed\n- **Accessible** — keyboard support out of the box\n- **Performant** — uses transforms, not re-renders\n- **Flexible** — sortable, droppable, sensors\n\n```bash\npnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/modifiers\n```\n\nAlternatives: `react-beautiful-dnd` (deprecated, no React 18+ support) and `react-dnd` (lower-level, steeper learning curve).",
        }),
      ],
    },
  ],

  // --- Conv 10: API docs (archived) ----------------------------------------
  "conv_01HPXKQ3W0FR3X7ATJQ1S4C5E6J": [
    {
      id: "msg_10_1",
      conversationId: "conv_01HPXKQ3W0FR3X7ATJQ1S4C5E6J",
      role: "user",
      modelName: "",
      inputTokens: 0,
      outputTokens: 0,
      createdAt: iso(10 * day),
      updatedAt: iso(10 * day),
      status: "complete",
      sequenceOrder: 0,
      blocks: [
        blk("msg_10_1", 0, {
          content: "Help me write API documentation for our v2 REST endpoints.",
        }),
      ],
    },
    {
      id: "msg_10_2",
      conversationId: "conv_01HPXKQ3W0FR3X7ATJQ1S4C5E6J",
      role: "assistant",
      modelName: "claude-sonnet-4-20250514",
      inputTokens: 280,
      outputTokens: 620,
      createdAt: iso(10 * day - 3 * min),
      updatedAt: iso(10 * day - 1 * min),
      status: "complete",
      sequenceOrder: 1,
      blocks: [
        blk("msg_10_2", 0, {
          blockType: "thinking",
          content:
            "The user wants API documentation for v2 endpoints. I should first check what endpoints exist in their codebase, then generate OpenAPI/Swagger docs. Let me search for route definitions.",
        }),
        blk("msg_10_2", 1, {
          blockType: "tool_use",
          toolUseId: "tool_10_a",
          toolName: "search_codebase",
          toolInput: JSON.stringify(
            { query: "router.GET|router.POST|app.Handle", glob: "**/*.go" },
            null,
            2
          ),
        }),
        blk("msg_10_2", 2, {
          blockType: "tool_result",
          toolUseId: "tool_10_a",
          toolResult: JSON.stringify(
            {
              matches: 12,
              endpoints: [
                "GET /api/v2/conversations",
                "POST /api/v2/conversations",
                "GET /api/v2/conversations/:id/messages",
                "POST /api/v2/conversations/:id/messages",
              ],
            },
            null,
            2
          ),
        }),
        blk("msg_10_2", 3, {
          content:
            "I found 4 v2 endpoints. Here's a draft OpenAPI spec:\n\n```yaml\nopenapi: 3.0.3\ninfo:\n  title: Workavera API v2\n  version: 2.0.0\npaths:\n  /api/v2/conversations:\n    get:\n      summary: List conversations\n      parameters:\n        - name: status\n          in: query\n          schema: { type: string, enum: [active, archived] }\n        - name: pinned\n          in: query\n          schema: { type: boolean }\n      responses:\n        '200':\n          description: Success\n          content:\n            application/json:\n              schema:\n                type: array\n                items: { $ref: '#/components/schemas/Conversation' }\n```\n\nWant me to generate the full spec for all endpoints?",
        }),
      ],
    },
  ],
}
