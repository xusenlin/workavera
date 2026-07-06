# Fantasy Chat 模块实施计划

## 决策

- 后端采用 `charm.land/fantasy`；模型、消息和流回调适配封装在 `internal/agent`，应用工具通过组合根注入。
- 项目只暴露两种 AI SDK UI 兼容的数据：最终消息 `ChatMessage` 和流式增量 `StreamChunk`。
- 数据库的 `parts` 与前端 `UIMessage.parts` 使用同一种 JSON 结构；不再使用 `MessageBlock`、`thinking`、`tool_use`、`tool_result`。
- 每次发送都必须显式提供 `modelConfigId`。会话不保存默认、上次或偏好模型。
- 输入框初始模型来自当前用户 `llm_models.is_default = true` 的配置；没有默认配置时必须手动选择。
- 模型配置关系和调用时快照保存在 assistant message 上。
- 浏览器断开仅移除 SSE 订阅者，不取消后台生成。后台任务继续聚合并保存结果；显式停止、服务关闭或运行超时才取消 Agent context。

## 数据流

```text
Fantasy callbacks
    -> internal/agent Fantasy adapter
    -> AI SDK UI compatible StreamChunk
       -> SSE subscriber (连接存在时)
       -> Go reducer
          -> ChatMessage snapshot
             -> PocketBase chat_messages.parts/metadata
```

`StreamChunk` 对齐 AI SDK UI Message Stream v1，包括：

- `start`、`finish`、`abort`、`error`
- `start-step`、`finish-step`
- `text-start`、`text-delta`、`text-end`
- `reasoning-start`、`reasoning-delta`、`reasoning-end`
- `tool-input-start`、`tool-input-delta`、`tool-input-available`
- `tool-output-available`、`tool-output-error`
- `source-url`、`source-document`、`file`
- `message-metadata`

工具定义在 Go 后端，因此 UI 工具流统一设置 `dynamic: true`，最终聚合为 `DynamicToolUIPart`。

SSE 出网前执行 UI Message Stream v1 必填字段校验。Fantasy 产生的空 text、reasoning、tool-input delta 会被忽略，避免 `omitempty` 生成缺字段事件并触发前端 Zod 中断。`input` 和 `output` 的 JSON `null` 是合法值，必须保留。

持久化的 `step-start` 是模型历史回放边界。多步工具消息必须恢复为 `assistant(tool_use) -> tool(tool_result) -> assistant(final text)`，reasoning provider metadata（包括只有签名、没有文本的 part）也必须一并恢复。

## 工具链与依赖

### Go

- `go.mod` 升级到 Go 1.26.4。
- Docker builder 升级到 `golang:1.26.4-alpine`。
- README 环境要求同步为 Go 1.26.4+。
- 固定 `charm.land/fantasy v0.35.0`。
- Fantasy 工具循环最多执行 12 step，外层运行仍保留 10 分钟超时。

### 应用工具

- `internal/assistant/tools` 只负责把应用能力包装为 Fantasy 工具和注册工具。
- `internal/contacts`、`internal/board` 负责领域查询与可见性；工具不得直接复制 collection 权限规则。
- 工具工厂在 Chat 组合根用 PocketBase App 创建，再按当前 `actorId` 为每次运行创建工具。
- 列表型工具必须有默认和最大返回数量，避免把整个集合塞入模型上下文。
- 联系人工具仅返回非敏感摘要；手机号等资料不默认发送给外部模型。
- Mock 工具不进入生产注册表。

### 前端

- `ai` 对齐到 `7.0.15`。
- 安装 `@ai-sdk/react 4.0.16`，使用 `useChat` 管理流式消息、状态、错误和停止请求。
- 继续使用现有 AI Elements 组件渲染 Markdown、reasoning 和工具状态。
- Zustand 只管理会话目录；不再保存和归并消息流。

## PocketBase 集合

### `chat_conversations`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `owner` | Relation -> users | 所有者，用户删除时级联删除 |
| `title` | Text | 会话标题 |
| `status` | Select | `active`、`archived` |
| `pinned` | Bool | 是否置顶 |
| `last_message_at` | Date | 会话排序时间 |
| `message_count` | Number | 缓存消息数 |
| `tool_call_count` | Number | 缓存工具调用数 |
| `input_tokens` | Number | 累计输入 token |
| `output_tokens` | Number | 累计输出 token |
| `total_tokens` | Number | 累计总 token |
| `created`、`updated` | Autodate | 时间戳 |

会话中不保存任何模型字段。

### `chat_messages`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `conversation` | Relation -> chat_conversations | 所属会话，级联删除 |
| `parent_message` | Relation -> chat_messages | assistant 对应的 user message，可空 |
| `sequence` | Number | 会话内顺序 |
| `role` | Select | `user`、`assistant` |
| `status` | Select | `pending`、`streaming`、`complete`、`error`、`cancelled` |
| `model_config` | Relation -> llm_models | assistant 实际使用的模型配置，可空、不级联 |
| `parts` | JSON | 与 `UIMessage.parts` 一致 |
| `metadata` | JSON | 模型快照、usage、finish reason、公开错误 |
| `created`、`updated` | Autodate | 时间戳 |

`metadata.model` 保存调用时的 `configId`、`modelId`、`name`、`protocol`，因此模型配置修改或删除后历史仍可解释。

## 后端包

```text
internal/agent/
  agent.go       Runner、Request、Result
  types.go       Message、Part、StreamChunk
  fantasy.go     Fantasy 回调适配及 provider 创建

internal/assistant/tools/
  registry.go    actor-scoped 工具工厂
  contacts.go    联系人工具适配
  board_projects.go

internal/contacts/
  query.go       联系人安全投影与有界搜索

internal/board/
  queries.go     owner/member 可见项目查询

internal/chat/
  chat.go        路由注册
  conversations.go
  messages.go
  stream.go      后台运行、SSE 订阅、停止
  reducer.go     StreamChunk -> Message snapshot
  repository.go  PocketBase 写入
  protocol.go    AI SDK UI SSE v1
```

Chat 包从数据库加载可信历史和模型配置，组装系统提示词与上下文，再调用 Agent。浏览器不上传完整历史。

## API

- `GET /api/chat/conversations`
- `POST /api/chat/conversations`
- `PATCH /api/chat/conversations/{id}`
- `DELETE /api/chat/conversations/{id}`
- `GET /api/chat/conversations/{id}/messages`
- `POST /api/chat/stream`
- `POST /api/chat/runs/{id}/stop`

`POST /api/chat/stream` 必须包含：

```json
{
  "runId": "client generated UUID",
  "conversationId": "conversation record id",
  "modelConfigId": "llm_models record id",
  "message": {
    "id": "client id",
    "role": "user",
    "parts": [{ "type": "text", "text": "hello" }]
  }
}
```

`runId` 由客户端在发送前生成，使用户在尚未收到第一段 SSE 时也能通过 stop API 精确取消后台运行。

服务端验证会话和模型配置都属于当前用户。响应使用 `text/event-stream` 和 `x-vercel-ai-ui-message-stream: v1`。

## 断连与后台运行

- 请求处理器创建一个不继承 `Request.Context()` 取消信号的运行 context。
- 运行 context 仍带最大运行时间，并登记到进程级 run registry。
- Agent 在后台 goroutine 中执行，Reducer 和数据库持久化属于运行本身。
- SSE writer 是可移除 subscriber；写失败或请求断开后只注销 subscriber。
- 显式 stop API 调用 run registry 中的 cancel function，将消息标记为 `cancelled`。
- 服务关闭时统一取消 registry 中的运行。
- 不在整个模型调用期间持有数据库事务；按 part 完成、工具状态变化、定时 checkpoint 和最终完成进行短事务写入。
- 后台 goroutine panic 时发布公开错误事件并把 assistant message 标记为 `error`，不能留下永久 `streaming` 记录。
- Provider 原始错误和 panic stack 只写服务端结构化日志；消息 metadata 仅保存稳定错误码和安全文案。

单实例阶段 run registry 使用内存即可。多实例部署前需引入持久队列/租约，否则断连续跑只保证在当前进程存活期间成立。

## 前端

- 会话列表仍由 Zustand 和 PocketBase API 管理。
- 活跃会话消息由 `useChat<ChatUIMessage>` 管理。
- `DefaultChatTransport` 负责解析标准 SSE；请求准备函数只发送当前 user message、`conversationId` 和必填 `modelConfigId`。
- Prompt 输入框从 `useLlmSettingsStore.models` 读取模型；初始选择 `isDefault` 配置。
- 没有模型或未选择模型时禁用发送。
- 模型下拉框变化只影响下一次 `sendMessage` 参数，不写入 conversation。
- `ChatMessageItem` 直接渲染 `message.parts`。

## 验证

- Go 单元测试覆盖 Fantasy text/reasoning/tool/source 映射、metadata-only reasoning、Reducer、多 step、断连续跑、panic 收敛和错误脱敏。
- 领域查询测试覆盖工具返回上限、联系人敏感字段排除、Board owner/member 可见性。
- API 测试覆盖所有权、必填模型、集合 CRUD 和消息持久化。
- 使用 Go 生成 SSE fixture，并由 `ai` 包解析，形成跨语言协议契约测试。
- 前端验证默认模型、必填模型、模型切换、流式渲染、刷新恢复和停止行为。
- 最终执行 `go test ./...`、`pnpm typecheck`、`pnpm lint`、`pnpm build`。
