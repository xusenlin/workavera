# Workavera

Workavera 是一个可自托管的 AI 团队工作台，让聊天直接变成任务、文档、联系人和可发布内容。

基于 Go 和 PocketBase 构建，免费、开源，并支持自行部署。

## 产品定位

Workavera 面向个人开发者和小团队，底层由 AI 驱动，核心目标不是替代大型协作套件，而是把 AI 对话、任务推进、外部资料和团队上下文连接起来，形成一个轻量、可自托管的工作流。

核心模块定位：

- `Reading` 是外部信息输入层，用于保存文章、网页、GitHub 项目、产品资料和调研链接，再通过 AI 总结为文档、任务或行动项。
- `Contacts` 是关系上下文层，用于管理客户、伙伴、候选人和协作者，并为 AI 提供安全的联系人上下文。
- `Chat` 是 AI 工作入口，用于理解问题、生成方案、查询工作区上下文，并把对话结果转成任务、文档、联系人记录或微应用。
- `Docs` 是工作沉淀层和发布层，用于把聊天、任务、客户沟通和项目过程中的有效信息沉淀为可搜索、可复用、可发布的轻量文档。
- `Board` 是行动推进层，用于管理项目、任务、负责人、状态、优先级和截止日期。
- `Calendar` 是时间承诺层，用于集中展示任务截止、联系人跟进、项目节点、个人提醒和 AI 创建的日程。
- `AI Micro Apps` 是轻量交付层，用于把思想灵感快速变成原型，并生成和管理自包含的小工具、演示页或一次性工作应用。

`Docs`、`Reading` 和 `Calendar` 的边界应保持清晰：`Reading` 负责吸收外部资料，`Docs` 负责沉淀内部知识，`Calendar` 负责承接必须在某个时间行动的承诺。

## 环境要求

- Go 1.26.4+
- [Task](https://taskfile.dev/) 3+
- PocketBase v0.39.4（已作为 Go 模块依赖）

## 本地开发

```bash
task dev
```

该任务会先构建 `frontend/dist`，再启动 PocketBase。单独开发前端时可运行 `task frontend:dev`。

启动后可访问：

- 应用首页：<http://127.0.0.1:8090>
- 管理后台：<http://127.0.0.1:8090/_/>
- 健康检查：<http://127.0.0.1:8090/api/health>

首次打开管理后台时，按照页面提示创建超级管理员账号。

## 常用命令

```bash
task dev    # 启动开发服务器
task build  # 构建可执行文件
task frontend:build # 构建前端资源
task frontend:dev   # 启动 Vite 开发服务器
task docker:build # 构建带版本标签的 Docker 镜像
task test   # 运行测试
task tidy   # 整理 Go 依赖
```

应用版本由根目录的 `VERSION` 文件统一维护。构建后的程序可通过 `./workavera --version` 查看版本。

PocketBase 的运行数据保存在 `pb_data/`，该目录不会提交到 Git。数据库结构变更会在使用 `go run` 开发时自动生成 Go 迁移文件并保存在 `migrations/`。

## Docker

```bash
task docker:build
docker run --rm \
  -p 8090:8090 \
  -v workavera-data:/app/pb_data \
  ghcr.io/xusenlin/workavera:0.0.1
```

`task docker:build` 每次都会先在宿主机打包前端资源。容器内的二进制位于 `/app/workavera`，前端产物位于 `/app/frontend/dist`；本地与容器中的 PocketBase 都使用 `frontend/dist` 作为首页。容器使用非 root 用户运行，PocketBase 数据由 `workavera-data` 卷持久化。

镜像会同时生成 `ghcr.io/xusenlin/workavera:0.0.1` 和 `ghcr.io/xusenlin/workavera:latest` 标签，并写入 OCI 版本标签与 `APP_VERSION` 环境变量。

## 项目结构

```text
.
├── workavera.go     # PocketBase 启动入口与自定义路由
├── Dockerfile       # 多阶段容器构建
├── VERSION          # 应用版本
├── frontend/        # Vite 前端项目，构建产物为 dist/
├── internal/board/  # Board 路由、领域校验与操作日志 Hook
├── internal/agent/  # Fantasy 封装与 AI SDK UI 兼容流
├── internal/assistant/tools/ # 应用能力到 Fantasy 工具的适配与注册
├── internal/contacts/ # 联系人领域查询与安全投影
├── internal/chat/   # 会话持久化、后台运行与 SSE API
├── migrations/      # 数据库迁移
├── go.mod
└── Taskfile.yml
```
