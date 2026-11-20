# Workavera 自托管指南

[English](./self-hosting.md) · [返回 README](../README.zh-CN.md)

管理员安装、配置和运行 Workavera 需要的全部内容：安装、首次运行、实例设置、隐私与本地模型、沙箱，以及从源码构建。

## 安装

无需任何开发工具链，直接运行预构建镜像或二进制即可。

### Docker

```bash
docker run -p 8090:8090 -v workavera-data:/app/pb_data ghcr.io/xusenlin/workavera:latest
```

镜像包含除[沙箱](#沙箱sandbox)以外的全部功能；沙箱需要使用预构建二进制，并在主机上安装 Docker。

### 预构建二进制

从 [GitHub Releases](https://github.com/xusenlin/workavera/releases) 下载对应平台的压缩包，解压后在终端中启动（它是一个服务进程，双击运行是不够的）：

```bash
./workavera serve            # Windows 下为 workavera.exe serve
```

默认监听 <http://127.0.0.1:8090>；如需局域网访问，加上 `--http=0.0.0.0:8090`。

## 首次运行

1. **使用 demo 用户登录。** 全新数据目录会自动创建一个应用用户：账号 `demo@workavera.local`，密码 `workavera`。
2. **保护账号安全。** 在将 Workavera 开放给局域网其他设备或公网访问前，请先在 Profile 中修改 demo 用户密码。
3. **创建超级管理员。** PocketBase 会打印一个带 token 的一次性链接，形如 `http://127.0.0.1:8090/_/#/pbinstal/<token>`。在终端输出中找到它（后台运行的容器用 `docker logs` 查看），打开链接并创建用于管理集合和应用用户的超级管理员。超级管理员本身不能登录 Workavera。
4. **配置模型。** 在 Settings 中添加至少一个模型配置后即可使用 Chat 和 AI 总结。
5. **开启沙箱（可选）。** 以预构建二进制运行且主机装有 Docker 时，在 Settings → Sandbox 中打开即可，镜像会在首次使用时拉取。详见[沙箱（Sandbox）](#沙箱sandbox)。

只有当 `users` 集合为空时才会初始化 demo 用户，因此升级已有工作区不会新增账号，也不会覆盖现有账号。

实例级设置保存在 `configs` 集合中，只有超级管理员能在 PocketBase 后台修改。除了[沙箱](#沙箱sandbox)相关的 key，`chat.max_steps`（默认 `80`，取值 2 到 500）限制一次 Chat 回复最多调用模型的次数；最后一次不能调用工具，因此达到上限的回复也会以总结结束。`resources.max_file_size_mb`（默认 `10`，取值 1 到 100）是 Resources 接受的最大文件大小，上传和沙箱导出都受它限制。

## 数据隐私与本地模型

自托管本身已经解决了大半：项目、任务、文档、日历、稍后读、联系人、上传的文件以及完整的对话记录，全部存在你自己机器上的 `pb_data` 里——记录在 SQLite 数据库中，文件在 `storage` 目录中；沙箱里的文件也留在同一台主机的 Docker 数据卷里。Workavera 没有任何遥测，也没有厂商后端。唯一会离开这台服务器的流量，都是你自己配置出来的——你在 Settings 里添加的模型服务商、你自己接入的外部 MCP 服务，以及开启沙箱后从 `ghcr.io` 拉取镜像、和 `sandbox.network` 允许时沙箱里命令访问的地址。上传的资源以原文件保存在磁盘上，模型不会直接拿到原文件，只会看到助手将文件导入沙箱后运行命令返回的输出；原文件只会通过你批准的下载链接（五分钟内有效），或在联网沙箱中执行的命令离开服务器。

模型调用通常是最后一份交给第三方的数据，而这一份同样可以留在本地。本地推理服务在 Settings 里的添加方式和在线服务商完全一样，且四种协议都可以用于本地——OpenAI、OpenAI 兼容、Anthropic Messages、Google——所以 LM Studio、Ollama、vLLM、llama.cpp 都能接；按你的推理服务实际暴露的端点选协议即可。

| 字段 | 值 |
| --- | --- |
| 协议 | 按推理服务暴露的端点选。LM Studio 同时提供 OpenAI 兼容与 Anthropic 兼容端点，Ollama 提供 OpenAI 兼容端点 |
| Base URL | 服务地址，Anthropic 协议填 `http://127.0.0.1:1234`，OpenAI 系协议填 `http://127.0.0.1:1234/v1`（Ollama 端口为 11434） |
| Model ID | 推理服务报告的模型名，例如 `qwen/qwen3.8-27b` |
| API Key | 留空即可，本地服务不校验 |

这条路是实际支持的，不是纸面选项。一台 Apple 芯片 Mac 上用 LM Studio 跑 27B 级别的本地模型（Qwen3.8 27B，MLX 4bit，磁盘占用约 16 GB），经由它的 Anthropic 兼容端点接入，足以完整驱动 Chat：多轮推理、调用 Board / Calendar / Docs / Reading 的工作区工具，以及在此之上的外部 MCP 工具。这种配置下，整条链路——你的工作区数据、由它拼装出的提示词、工具返回的结果——都留在你自己的硬件上，拔掉网线 Workavera 依然能用。

依赖它之前有两点需要知道：

- **模型变小时，最先崩掉的是工具调用。** 回答质量随模型缩小是平滑下降的，而“连续多轮都能输出格式正确的工具调用”这件事不是。请优先选择工具调用能力扎实的模型；27B 的 4bit 量化大约需要 16 GB 空闲内存。
- **本地模型并不会让外部 MCP 服务也变成本地的。** 如果你接入了托管的 MCP 服务（比如联网搜索），模型发给它的参数仍然会离开你的机器。

Base URL 是由 Workavera 服务端发起请求的，不是浏览器。如果 Workavera 跑在容器里、且容器的网络模式看不到宿主机的 `127.0.0.1`，把地址换成 `http://host.docker.internal:1234` 即可。

## 资源下载链接

助手为资源创建的下载链接，只在服务端 Application URL（PocketBase 设置）使用 HTTPS 时才会签发。

## 沙箱（Sandbox）

在 Settings 中开启沙箱的用户，会获得一个属于自己的 Linux 容器（`workavera-<用户 ID>`，`/workspace` 位于命名数据卷中），Chat 里的助手可以在其中执行命令、编写 Python 和 Node 脚本，并在沙箱与 Resources、Docs 之间搬运文件。前提条件：

- **Workavera 以预构建二进制直接运行在主机上**，而不是运行在 Docker 镜像中。Workavera 运行在容器中时沙箱不可用：在容器里访问 Docker 只能挂载宿主机的 Docker socket，或以 `--privileged` 运行 Docker-in-Docker，两者都等于把整台宿主机交给一个面向网络的服务。因此官方镜像不包含 Docker CLI。
- **主机上安装了 Docker**，`PATH` 中有 `docker` 命令，且运行 Workavera 的系统用户有权使用它。在 Linux 上这通常意味着加入 `docker` 组，而该组等同于 root 权限，建议使用专用主机或虚拟机，或者使用 rootless Docker。

镜像 `ghcr.io/xusenlin/workavera-sandbox`（见 [xusenlin/workavera-sandbox](https://github.com/xusenlin/workavera-sandbox)）在首次使用时拉取。超级管理员在 PocketBase 后台（`/_/`）通过 `configs` 集合中的以下记录控制沙箱，非法值会在保存时被拒绝：

| key | 默认值 | 说明 |
| --- | --- | --- |
| `sandbox.enabled` | `true` | 总开关；设为 `false` 会停止所有沙箱容器 |
| `sandbox.image` | `"ghcr.io/xusenlin/workavera-sandbox:4"` | 新建和重建容器使用的镜像，例如镜像加速地址 |
| `sandbox.network` | `true` | 网络总开关；设为 `false` 会让所有沙箱离线 |
| `sandbox.limits` | `{"memory": "1g", "cpus": 2, "pids": 512}` | 每个容器的资源上限，立即作用于已有容器 |
| `sandbox.idle_timeout_minutes` | `60` | 空闲多少分钟后停止容器；`0` 表示不自动停止 |

安全提醒：容器与宿主机共享内核，不能作为运行恶意代码的隔离边界，向不可信用户开放的实例请部署在专用主机或虚拟机上。联网的沙箱可以访问宿主机上已发布的端口、局域网，以及 `169.254.169.254` 这类云厂商元数据接口，请用防火墙限制 `workavera-sandbox` 网络，或关闭 `sandbox.network`。磁盘用量没有配额，请监控 Docker 数据目录所在的磁盘。`docker ps -a --filter label=workavera.sandbox=1` 可以列出全部沙箱。

## 移动客户端兼容性

客户端直接访问服务端的数据集合，因此服务端必须新到拥有客户端会查询的那些集合。
升级顺序是先升服务端，再升客户端。

| Android / iOS | 要求服务端 | 原因 |
| --- | --- | --- |
| 1.0.4 | 0.1.1 及以上 | 任务开始日期、项目公开链接与订阅发现 |
| 1.0.2 | 0.0.10 及以上 | 任务归档需要 `board_tasks.archived` |
| 1.0.1 | 0.0.9 及以上 | 自建 MCP 服务需要 `mcp_servers` |

服务端更新后旧版客户端仍可使用，只是用不到它不认识的能力：1.0.2 之前的客户端
不会过滤归档任务，归档后的任务仍会显示在它的看板里。

## 从源码构建

以下内容仅在参与开发或从源码构建时需要。环境要求：Go 1.27.2+、Node.js 与 [pnpm](https://pnpm.io/)、[Task](https://taskfile.dev/) 3+。

```bash
cd frontend && pnpm install && cd ..   # 首次执行一次

task dev:go     # 后端 http://127.0.0.1:8090（管理后台 /_/）
task dev:ui     # Vite 开发服务器 http://127.0.0.1:5173
task test       # go test ./...
task build      # 构建内嵌前端的自包含二进制
task release    # 交叉编译发布压缩包到 dist/
```

全部任务定义见 [`Taskfile.yml`](../Taskfile.yml)；前端专用命令见 [`frontend/README.zh-CN.md`](../frontend/README.zh-CN.md)。
