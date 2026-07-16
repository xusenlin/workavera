# Chat 产品需求与 Fantasy 架构

[English](./chat-fantasy-plan.md)

> 实现基线：Workavera `0.0.2`，于 2026-07-13 按提交 `3684be1` 核验。

## 1. 产品目的

Chat 是 Workavera 的 AI 工作入口，将用户自己的模型配置、持久化会话、流式推理和工具结果，以及感知权限的工作区操作组合在一起。会话可以搜索工作区上下文，并且只在用户明确要求写入时创建或更新受支持的记录。

## 2. 目标

- 在 PocketBase 中持久化会话和兼容 AI SDK UI 的消息 parts。
- 通过 SSE 流式传输文本、推理、来源和动态工具状态。
- 支持 OpenAI、OpenAI-compatible、Anthropic 和 Google 模型配置。
- 每轮对话必须显式使用当前用户拥有的模型配置。
- 浏览器断开后继续运行，并在服务进程存活时支持重新连接。
- 允许用户显式停止运行，并在应用全局展示活动运行。
- 为后续模型调用正确重建多步工具历史。
- 将 Provider 凭据保留在服务端，只公开安全的消息元数据和错误。
- 为工作区工具结果提供自定义 UI 卡片和深链接。

## 3. 非目标

- 共享会话或多人协同编辑 Chat。
- 匿名 Chat 或由服务端替用户选择模型。
- 跨多实例的持久任务执行；活动运行保存在当前进程内。
- 自动重试失败的模型或工具调用。
- 由浏览器提交可信的完整会话历史。
- 未经用户明确要求的工作区写入。
- Board 或 Calendar 的破坏性 Assistant 工具。

## 4. 模型配置

每一轮 Chat 都引用调用者拥有的 `llm_models` 记录。

- 支持 `openai`、`openai-compatible`、`anthropic` 和 `google` 协议。
- 配置包含显示名称、模型 ID、Base URL、API Key、可选最大输出 token、上下文窗口大小（默认 256k）和默认状态。
- 用户创建的第一个模型自动成为默认模型，也可以设置其他默认模型。
- 输入框优先选择会话最近使用的 `model_config`，没有时使用用户默认模型。
- 每次运行都提交模型选择，并更新会话最近使用的 `model_config`。
- Assistant 消息保存模型关系，并在 metadata 中快照配置 ID、模型 ID、显示名称和协议。
- 接收的共享模型副本记录 `shared_from`，不能继续转发；只有原作者可以分享配置。
- API Key 对 Records API 隐藏，自定义认证接口只返回 `hasApiKey`。

Fantasy 最多执行 12 个 Agent step。模型未设置正数限制时，默认最多输出 16,384 token。

## 5. 数据模型

### `chat_conversations`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `owner` | relation → users | 必填，级联删除 |
| `model_config` | relation → llm_models | 会话最近使用的模型 |
| `title` | text | 必填，最长 200 个字符；默认为 `New conversation` |
| `status` | select | `active` 或 `archived` |
| `pinned` | bool | 个人置顶，最多六个会话 |
| `last_message_at` | date | 会话排序时间 |
| `message_count` | number | 缓存的消息总数 |
| `tool_call_count` | number | 缓存的已完成动态工具调用数 |
| `input_tokens` | number | 累计输入用量 |
| `output_tokens` | number | 累计输出用量 |
| `total_tokens` | number | 累计总用量 |
| `context_tokens` | number | 最近一次运行后的上下文窗口占用 |
| `context_summary` | text | 较旧轮次的当前压缩摘要 |
| `summary_until_sequence` | number | 摘要覆盖到的最后一条消息 sequence |
| `created`、`updated` | autodate | 记录时间 |

Records API 规则全部按 Owner 隔离。用户可以创建、重命名、置顶、归档、恢复和删除自己的会话。

### `chat_messages`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `conversation` | relation → chat_conversations | 必填，级联删除 |
| `parent_message` | relation → chat_messages | Assistant 响应对应的 User 消息 |
| `sequence` | number | 会话内唯一顺序 |
| `role` | select | `user` 或 `assistant` |
| `status` | select | `pending`、`streaming`、`complete`、`error` 或 `cancelled` |
| `model_config` | relation → llm_models | Assistant 消息使用的模型 |
| `parts` | JSON | 兼容 AI SDK `UIMessage.parts` 的内容，最大 4 MiB |
| `metadata` | JSON | 运行、模型、用量、结束原因、step 数和安全错误 |
| `created`、`updated` | autodate | 记录时间 |

消息只能通过其 Owner 会话读取。客户端 Records API 写入被禁用，由 Chat 服务创建并保存检查点。

## 6. 流与持久化架构

```text
Fantasy callbacks
  -> internal/agent 适配层
  -> AI SDK UI Message Stream v1 chunks
     -> 内存运行历史 -> SSE 订阅者
     -> reducer -> chat_messages parts/metadata 快照
```

流支持生命周期、step、文本、推理、工具输入/输出、URL/文档来源、数据（`data-compaction`）和消息元数据事件。应用工具定义在 Go 服务端，因此统一以动态工具传输。

协议规则：

- 无效 wire chunk 和空 delta 在 SSE 序列化前丢弃。
- JSON `null` 是合法的工具输入/输出。
- 持久化 `step-start` 标记，用于重建多步 Assistant/Tool 历史。
- 保留推理和工具 part 的 Provider metadata，包括 Anthropic thinking signature。
- 浏览器只发送新增 User 消息，可信历史从 PocketBase 加载。
- 模型上下文包含摘要边界之后的全部完成消息，并在最前注入当前压缩摘要（合成 User 消息）。
- 上一次运行超过模型上下文窗口 75% 时，下一次运行先用同一模型把较旧轮次压缩进摘要（保留最近 4 个 User 轮原文），并发送 `data-compaction` part；持久化消息不会被修改。
- 模型运行前，在事务中创建 User 和 Assistant 消息。
- 重要 part 状态变化时保存流式快照；后续 chunk 到达且已超过一秒检查点间隔时也会保存。
- 成功结束后保存最终 parts 与 metadata，再更新会话用量统计和上下文占用快照（按末步用量并对各协议缓存口径做归一）。

## 7. 运行生命周期与恢复

- 客户端提供 UUID `runId`；省略时服务端生成。
- 每个会话同时只允许一个活动运行，重复 `runId` 会被拒绝。
- 运行使用最长十分钟的后台 context，不依赖发起请求的 HTTP context。
- SSE 客户端断开不会停止运行。`GET /api/chat/runs/{id}/stream` 会重放缓存 chunk 并继续跟随新数据。
- UI 加载持久消息后，会对 metadata 包含 `runId` 且状态为 `streaming` 的消息恢复连接。
- `POST /api/chat/runs/{id}/stop` 取消当前用户拥有的运行，并将 Assistant 消息保存为 `cancelled`。
- 进程终止时取消全部内存运行。
- 服务启动时，遗留的 `streaming` 消息标记为 `error`，错误码为 `run_interrupted`。
- Provider 失败、超时和 panic 只向客户端公开稳定安全的消息，详细诊断写入服务端日志。

运行恢复只保证在同一服务进程存活期间有效。多实例部署需要持久队列、共享事件日志和租约/所有权机制。

## 8. API

`chat_conversations` 的会话 CRUD 使用 PocketBase Records API。

自定义认证接口：

- `GET /api/chat/conversations/{id}/messages`
- `POST /api/chat/stream`
- `GET /api/chat/runs/{id}/stream`
- `POST /api/chat/runs/{id}/stop`

`POST /api/chat/stream` 请求体：

```json
{
  "runId": "客户端生成的 UUID",
  "conversationId": "会话记录 ID",
  "modelConfigId": "当前用户拥有的 llm_models 记录 ID",
  "message": {
    "id": "客户端消息 ID",
    "role": "user",
    "parts": [{ "type": "text", "text": "hello" }]
  }
}
```

服务端要求存在非空 User 文本 part，并校验会话与模型所有权。流响应使用 `text/event-stream` 和 `X-Vercel-AI-UI-Message-Stream: v1`。

## 9. Assistant 工具

按当前用户创建的生产工具注册表包含：

- Contacts：安全联系人搜索。
- Board：项目、任务和模板读取，以及感知权限的项目、流程、标签、成员和任务写入。
- Calendar：日程查询、事件创建和更新。
- Reading：搜索、读取、写入和总结。
- Docs：搜索、读取、带乐观并发控制的写入和精确文本替换。
- AI Micro Apps：创建、更新、读取、列表、搜索、替换和分块 HTML 写入。

工具描述要求具备明确写入意图、使用前置读取获得的真实 ID、在适用场景提交最新 revision，并对同一资源串行写入。工具结果使用模块专属 UI 卡片渲染，并可通过统一工作区深链接打开记录。Mock 工具不会进入生产注册表。

## 10. 前端体验

- 会话目录每页加载 20 个活动会话，并区分 Pinned 与 Recent。
- 用户可以创建、重命名、置顶/取消置顶、归档、恢复和删除会话；归档列表独立分页。
- 活动会话使用统一的 `record` 查询参数定位。
- AI SDK `Chat`/`useChat` 管理实时消息状态，Zustand 管理会话目录。
- 消息渲染支持 Markdown、代码、推理、工具状态、自定义结果卡片、模型信息和安全错误。
- 没有可用且已选择的模型时不能发送消息。
- 全局运行监视器订阅流式 Assistant 消息，允许用户打开或停止其他会话中的运行。

## 11. 验收标准

- 会话、消息、工具结果、模型快照和用量统计可在刷新后恢复。
- 用户不能读取其他用户的会话、消息、模型或运行。
- 文本、推理、工具、来源、元数据、错误和取消均生成有效的 AI SDK UI part。
- 多步工具历史可以发送回所有支持的 Provider，且不会丢失必要 metadata。
- 在同一服务进程内，断开并重新连接可以恢复活动流。
- 显式停止、超时、Provider 失败、panic 和服务重启都会得到持久化的终止状态。
- 同一会话同时只能存在一个运行。
- 只有在用户明确要求且感知权限的工具成功后，工作区才会发生写入。
- 置顶上限、归档流程、深链接和活动运行监视器在刷新前后保持一致。
