# Workavera 前端

[English](./README.md) · [仓库说明](../README.zh-CN.md)

本目录包含 Workavera 的 Vite、React 与 TypeScript 应用。生产构建输出到 `frontend/dist`，并由 Go/PocketBase 应用提供服务。

## 技术栈

- React 19 与 React Router 8
- TypeScript 6 与 Vite 8
- Tailwind CSS 4
- `src/components/ui` 中的本地 shadcn/ui 基础组件
- Zustand Store
- PocketBase JavaScript SDK 与 realtime 订阅
- AI SDK React 与 AI Elements 风格组件
- Milkdown Crepe Markdown 文档编辑器
- 用于文档和微应用代码编辑的 CodeMirror 语言包

## 开发

安装依赖：

```bash
pnpm install
```

在仓库根目录启动 Go/PocketBase：

```bash
task dev:go
```

在本目录启动 Vite：

```bash
pnpm dev
```

打开 <http://127.0.0.1:5173>。Vite 会将 `/api` 代理到 <http://127.0.0.1:8090>。

如需使用其他 PocketBase 地址，可设置 `VITE_POCKETBASE_URL`。未设置时，前端使用 `window.location.origin`。

## 命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动 Vite 开发服务器 |
| `pnpm build` | 构建项目并输出 `dist` |
| `pnpm typecheck` | 运行 TypeScript 检查且不输出文件 |
| `pnpm lint` | 运行 ESLint |
| `pnpm format` | 使用 Prettier 格式化 TypeScript 与 TSX |
| `pnpm preview` | 预览构建后的前端 |

一般前端变更执行：

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## 源码结构

```text
src/
├── components/
│   ├── ai-elements/    # 流式 Chat 展示基础组件
│   ├── board/          # Board 与任务界面
│   ├── calendar/       # Calendar 列表与事件抽屉
│   ├── chat/           # 会话与工具结果 UI
│   ├── docs/           # Milkdown 文档编辑器
│   ├── notifications/  # 通知项
│   └── ui/             # 可复用本地 UI 基础组件
├── pages/              # 懒加载路由页面
├── store/              # Zustand 功能 Store
├── lib/                # PocketBase、导航、时区和共享工具
├── types/              # 共享前端类型
├── router.tsx          # 受保护的应用路由
└── App.tsx             # 认证与主题初始化
```

## UI 开发约定

- 添加新基础组件前，优先复用 `src/components/ui`。
- 使用以下命令添加 shadcn/ui 组件：

  ```bash
  pnpm dlx shadcn@latest add <component>
  ```

- 功能组件放在现有模块目录中。
- 记录深链接使用共享的 `workspaceRecordUrl` helper。
- PocketBase 访问沿用现有 Store 或页面服务，并遵守后端强制执行的 Owner/成员规则。
- 不直接编辑 `dist` 或 `node_modules`。
