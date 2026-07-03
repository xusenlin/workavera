# Assistant App

基于 Go 和 PocketBase 的个人助理应用。

## 环境要求

- Go 1.25+
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

应用版本由根目录的 `VERSION` 文件统一维护。构建后的程序可通过 `./assistant-app --version` 查看版本。

PocketBase 的运行数据保存在 `pb_data/`，该目录不会提交到 Git。数据库结构变更会在使用 `go run` 开发时自动生成 Go 迁移文件并保存在 `migrations/`。

## Docker

```bash
task docker:build
docker run --rm \
  -p 8090:8090 \
  -v assistant-app-data:/app/pb_data \
  ghcr.io/xusenlin/assistant-app:0.0.1
```

`task docker:build` 每次都会先在宿主机打包前端资源。容器内的二进制位于 `/app/assistant-app`，前端产物位于 `/app/frontend/dist`；本地与容器中的 PocketBase 都使用 `frontend/dist` 作为首页。容器使用非 root 用户运行，PocketBase 数据由 `assistant-app-data` 卷持久化。

镜像会同时生成 `ghcr.io/xusenlin/assistant-app:0.0.1` 和 `ghcr.io/xusenlin/assistant-app:latest` 标签，并写入 OCI 版本标签与 `APP_VERSION` 环境变量。

## 项目结构

```text
.
├── assistant-app.go # PocketBase 启动入口与自定义路由
├── Dockerfile       # 多阶段容器构建
├── VERSION          # 应用版本
├── frontend/        # Vite 前端项目，构建产物为 dist/
├── migrations/      # 数据库迁移
├── go.mod
└── Taskfile.yml
```
