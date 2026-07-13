# Workavera

[English](./README.md)

Workavera 是一个可自托管的 AI 团队工作台，在同一个应用中连接对话、知识、关系、项目、任务和时间承诺。

**通过 Chat，让 AI 推动整个工作区。** AI 可以在你已有权限范围内调用工作区能力，查找上下文，并创建或更新受支持的记录；它不会获得超出你本人权限的访问能力。每项操作在真正执行前都会由服务端重新鉴权。

后端使用 Go 与 PocketBase，前端使用 Vite、React 与 TypeScript。打包部署时，PocketBase 进程直接提供编译后的前端资源。

## 产品截图

### Chat 与工作区工具

![Workavera Chat 调用 Board 工具创建项目](./screenShot/workavera_chat.png)

### Board 任务详情

![Workavera Board 任务详情](./screenShot/workavera_task.png)

## 产品模块

- **Dashboard** 展示活动项目数、未完成任务数、未来七天事项数和未读 Reading 数量，并提供最近到期任务、即将发生的事件与任务截止事项、最近更新的 Docs/Chat/Reading 记录和快捷入口。
- **Reading** 保存外部网址和笔记，支持关联项目、标签、阅读状态、置顶、归档、总结语言设置和 AI 总结。
- **Contacts** 提供可搜索的联系人列表、详细资料和个人收藏；Chat 仅搜索有数量限制且不包含敏感字段的联系人摘要。
- **Chat** 将模型输出、推理和工具调用流式写入持久化会话；浏览器断开后运行继续，可恢复连接或停止。
- **Docs** 管理个人与项目 Markdown 文档，提供 Milkdown 富文本、Source/Diff/全屏模式、明确版本、冲突检测、置顶、归档和 AI 编辑。
- **Board** 管理独立的项目流程、标签、角色、任务、活动记录、截止日期和同项目文档关联，并内置十套中英文流程模板。
- **Calendar** 合并个人事件与可见的 Board 截止事项，支持重复和系统时区调度，并生成站内提醒。
- **AI Micro Apps** 管理自包含 HTML 工具与原型，支持沙箱预览、置顶、归档/恢复，以及用于生成和修改 HTML 的 Assistant 工具。
- **Notifications** 实时提供模型分享请求、任务到期通知和日历提醒，并支持记录深链接。
- **Settings 与 Profile** 管理模型配置、模型分享、用户级外观、个人资料和头像。

Reading 是外部信息输入层，Docs 是可复用知识层，Board 是行动层，Calendar 是时间承诺层，AI Micro Apps 是交互式交付层。

Chat 将这些模块连接成感知权限的 AI 操作入口，可以搜索当前用户可见的上下文，并调用 Board、Calendar、Reading、Docs、Contacts 和 AI Micro Apps 已注册的工具。工具能力不会绕过产品规则：每次操作都由后端校验身份、角色、所有权、关联关系和 revision。

## 技术栈

- Go 1.26.4
- PocketBase 0.39.4
- Fantasy 0.35.0
- React 19、TypeScript 6、Vite 8
- Tailwind CSS 4 与本地 shadcn/ui 组件
- AI SDK UI 消息流
- Zustand 与 PocketBase JavaScript SDK
- Milkdown Crepe Markdown 编辑器

## 环境要求

- Go 1.26.4 或更高版本
- Node.js 与 [pnpm](https://pnpm.io/)
- [Task](https://taskfile.dev/) 3 或更高版本
- 仅在构建或发布容器时需要 Docker 与 Buildx

## 本地开发

首次安装前端依赖：

```bash
cd frontend
pnpm install
cd ..
```

在两个终端中分别运行后端和 Vite 前端：

```bash
task dev:go
```

```bash
task dev:ui
```

打开 <http://127.0.0.1:5173>。Vite 会将 `/api` 代理到 <http://127.0.0.1:8090> 的 PocketBase。

PocketBase 还提供：

- 管理后台：<http://127.0.0.1:8090/_/>
- 健康检查：<http://127.0.0.1:8090/api/health>

通过管理后台创建第一个 PocketBase 超级管理员和应用用户。Workavera 登录页只接受由管理员创建的账号。登录后，使用 Chat 或 AI 总结前需要在 Settings 中添加至少一个模型配置。

`task dev:go` 使用 `go run` 启动时会启用 PocketBase 自动迁移，并将结构变化写入 `migrations/`。

## 构建与运行

构建前端和后端：

```bash
task build:ui
task build:go
```

前端构建完成后运行打包应用：

```bash
task run
```

打开 <http://127.0.0.1:8090>。`task run` 会重新构建 Go 二进制，并提供现有的 `frontend/dist`。

版本来自 [`VERSION`](./VERSION)，并在构建时注入二进制。查看版本：

```bash
./workavera --version
```

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `task dev:go` | 启动 Go/PocketBase 开发服务器 |
| `task dev:ui` | 启动 Vite 开发服务器 |
| `task build:ui` | 类型检查并构建 `frontend/dist` |
| `task build:go` | 构建 `workavera` 二进制 |
| `task run` | 构建并运行 Go 二进制 |
| `task build:docker` | 构建前端和本地 `ghcr.io/xusenlin/workavera:latest` 镜像 |
| `task push` | 构建并推送 `linux/amd64` 版本镜像与 `latest` 镜像 |
| `task test` | 运行 `go test ./...` |
| `task tidy` | 运行 `go mod tidy` |

前端专用命令见 [`frontend/README.zh-CN.md`](./frontend/README.zh-CN.md)。

## Docker

构建本地镜像：

```bash
task build:docker
```

使用持久化 PocketBase 数据卷运行：

```bash
docker run --rm \
  -p 8090:8090 \
  -v workavera-data:/app/pb_data \
  ghcr.io/xusenlin/workavera:latest
```

容器使用非 root 用户运行，包含 CA 证书和时区数据，提供健康检查，将数据保存在 `/app/pb_data`，并由 Workavera 二进制提供 `/app/frontend/dist`。

`task push` 使用 `VERSION` 中的值，为 `linux/amd64` 同时发布 `:<version>` 和 `:latest`。

## 数据与安全说明

- 运行数据位于 `pb_data/`，不会提交到 Git。
- 模型 API Key 保存在隐藏的 `llm_models.api_key` 字段中，只通过认证服务端接口访问。
- 用户记录由 PocketBase 规则和服务端领域校验共同保护。
- Chat 历史由服务端加载，浏览器不提供权威的历史消息。
- 活动 Chat 运行保存在当前进程中。同一服务进程存活时可以恢复流；生产多实例执行需要共享的持久运行基础设施。
- Calendar 调度和提醒使用 `configs/system.timezone`。

## 项目结构

```text
.
├── workavera.go                 # PocketBase 入口与前端资源服务
├── internal/
│   ├── agent/                   # Fantasy 与 AI SDK 流适配
│   ├── assistant/tools/         # 按用户创建的工作区工具
│   ├── board/                   # 项目、任务、角色、校验和活动
│   ├── calendar/                # 事件、重复和日程查询
│   ├── chat/                    # 会话、运行、SSE 和持久化
│   ├── configs/                 # 系统配置 API
│   ├── contacts/                # 联系人与安全 Assistant 查询
│   ├── docs/                    # Markdown 文档与版本
│   ├── llm/                     # 模型设置与分享
│   ├── microapps/               # AI Micro Apps 与预览
│   ├── notifications/           # 实时通知与调度器
│   └── reading/                 # Reading 资料库与总结
├── migrations/                  # PocketBase 结构迁移与测试
├── frontend/                    # Vite React 应用
│   └── src/
│       ├── components/          # 功能组件与 UI 组件
│       ├── pages/               # 路由页面
│       ├── store/               # Zustand Store
│       └── lib/                 # PocketBase 与共享工具
├── doc/                         # 中英文产品文档
├── Dockerfile
├── Taskfile.yml
└── VERSION
```

## 产品文档

| 模块 | English | 简体中文 |
| --- | --- | --- |
| Board | [Board PRD](./doc/board-prd.md) | [Board PRD](./doc/board-prd.zh-CN.md) |
| Calendar | [Calendar PRD](./doc/calendar-prd.md) | [Calendar PRD](./doc/calendar-prd.zh-CN.md) |
| Chat | [Chat PRD and Fantasy architecture](./doc/chat-fantasy-plan.md) | [Chat PRD 与 Fantasy 架构](./doc/chat-fantasy-plan.zh-CN.md) |
| Docs | [Docs PRD](./doc/docs-prd.md) | [Docs PRD](./doc/docs-prd.zh-CN.md) |
