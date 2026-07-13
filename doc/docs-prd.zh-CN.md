# Docs 产品需求文档

[English](./docs-prd.md)

> 实现基线：Workavera `0.0.2`，于 2026-07-13 按提交 `3684be1` 核验。

## 1. 产品目的

Docs 是 Workavera 的可复用知识层，以 Markdown 保存个人笔记和 Board 项目文档，提供富文本与源码编辑、明确保存的版本历史和并发覆盖保护，并允许 Chat 使用相同权限与 revision 规则创建或修改文档。

项目文档可以关联到同一项目中的 Board 任务。

## 2. 目标

- 创建个人文档或通过 Board 项目共享的项目文档。
- 以 Markdown 作为正文唯一持久化格式。
- 提供 Rich text、Source、Diff 和全屏编辑体验。
- 只在用户或 AI 明确操作时保存，不自动向服务器写入正文。
- 每次发生内容变化的保存都创建不可变版本。
- 使用乐观 revision 校验检测并发编辑。
- 复用 Board Owner/成员角色控制项目文档权限。
- 支持个人置顶、搜索、分页、归档、版本恢复和永久删除。
- 允许 Chat 搜索、读取、创建、完整更新和精确替换 Markdown。
- 允许 Board 任务关联本项目的活动文档。

## 3. 非目标

- 字符级实时协作、远程光标或在线状态。
- 自动服务器保存或定时创建版本。
- 评论、批注、提及或文档通知。
- 文件夹、双向链接、知识图谱、块引用或语义/向量搜索。
- 独立于 Board 项目成员的文档协作者。
- 持久化编辑器 JSON、HTML、MDX、JSX 或自定义组件。
- 图片和文件附件。
- 公开发布。
- 将项目文档移回个人空间或直接移动到其他项目。

## 4. 核心规则

1. `docs.content` 是权威正文，内容格式为 Markdown。
2. `docs` 保存最新 revision，`doc_versions` 保存不可变快照。
3. 创建文档会生成 revision 1 和对应版本记录。
4. 标题和正文编辑只保留在本地，直到用户保存或 Assistant 明确写入。
5. 保存必须提交当前 `baseRevision`；revision 过期时返回 HTTP 409。
6. 无变化保存返回现有文档，不创建版本。
7. 恢复旧版本会创建一个新的最高 revision，来源为 `restore`。
8. 个人文档仅 Owner 可见和编辑。
9. 项目文档对项目 Owner 和所有成员可见；Owner、Admin 和 Member 可编辑，Viewer 的只读权限由服务端强制执行。
10. 只有文档创建者可以归档、取消归档或永久删除文档。
11. 个人文档 Owner 可以将文档一次性移入自己有编辑权限的项目。
12. 置顶是用户个人偏好，每位用户最多置顶六篇可访问文档。
13. 归档文档不可编辑，不进入普通搜索和置顶结果。

## 5. 数据模型

### `docs`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` | text | 必填，最长 240 个字符 |
| `content` | text | Markdown，最大 1 MiB |
| `owner` | relation → users | 创建者和个人文档 Owner，级联删除 |
| `project` | relation → board_projects | 个人文档为空 |
| `status` | select | `draft` 或 `archived` |
| `revision` | number | 从 1 开始的正整数 |
| `last_edited_by` | relation → users | 最近一次有变化保存的操作者 |
| `created`、`updated` | autodate | 记录时间 |

索引支持按 Owner、项目、状态和最近更新时间查询。PocketBase list/view 规则只向 Owner 暴露个人文档，并向项目参与者暴露项目文档。客户端 Records API 写入被禁用，所有修改通过 Docs 服务完成。

### `doc_versions`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `doc` | relation → docs | 必填，级联删除 |
| `revision` | number | 与 `doc` 组合唯一 |
| `title` | text | 标题快照 |
| `content` | text | Markdown 快照，最大 1 MiB |
| `created_by` | relation → users | 发起保存的用户 |
| `source` | select | `user`、`ai` 或 `restore` |
| `created` | autodate | 保存时间 |

版本列表按 revision 倒序返回最多 100 条，不包含完整正文；单个版本接口返回 Markdown 内容。

### `doc_pins`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user` | relation → users | 置顶用户，级联删除 |
| `doc` | relation → docs | 被置顶文档，级联删除 |
| `created` | autodate | 置顶时间 |

`user + doc` 唯一。置顶写入使用 Docs API，在事务中校验六篇上限和文档访问权。

## 6. 保存与并发行为

### 创建

`POST /api/docs` 接收标题、Markdown 正文和可选项目 ID。服务端校验用户及项目编辑角色后，在同一事务中创建当前文档和 revision 1 版本。

### 保存

`PUT /api/docs/{id}` 接收完整标题、完整 Markdown 和 `baseRevision`。

服务端在同一事务中：

1. 校验访问权、编辑角色和非归档状态；
2. 比较 `baseRevision` 与当前 revision；
3. 标题和正文无变化时直接返回；
4. revision 加一、更新 `last_edited_by` 并保存文档；
5. 创建相同 revision 和对应来源的版本。

收到 HTTP 409 时，编辑器保留本地草稿、显示 `New version available`，并提供 `Load latest`。只有本地草稿干净时，realtime 事件才会自动加载文档。

### 恢复

History 对话框可预览所选 revision 的 Markdown。恢复操作要求提交当前 base revision，并创建来源为 `restore` 的新版本；已有历史保持不变。

### 移入项目

只有个人文档 Owner 可以移动文档。目标项目必须授予 Owner、Admin 或 Member 权限。移动只改变访问范围，不改变正文 revision，也不创建版本。文档不能移回个人空间或直接移动到其他项目。

## 7. 编辑器体验

Docs 使用 Milkdown Crepe，并由应用提供工具栏。

- Rich text 是默认编辑模式。
- Source 模式在纯文本输入框中编辑同一份 Markdown。
- Diff 模式按行比较当前本地草稿与最近保存的 Markdown，展示新增和删除。
- Fullscreen 使用浏览器 Fullscreen API 全屏显示编辑器区域。
- 工具栏支持撤销/重做、正文与 H1-H3、粗体、斜体、行内代码、链接、无序/有序列表、引用、代码块、表格和分隔线。
- 代码块按需加载常用编程与标记语言。
- 标题在 Header 中直接编辑，并显示 `vN`、`Unsaved · vN` 或新版本提示；Save 操作显示进行中状态。
- 存在未保存草稿时，切换文档或刷新页面会触发提示。草稿不写入 localStorage。

所有编辑模式共享同一个 `draftContent`。切换模式和全屏不会保存或增加 revision。

## 8. 列表、归档与历史体验

- 左侧先显示 Pinned，再显示 Recent，并自动选择第一篇可用文档。
- 活动且未置顶的文档使用 PocketBase 服务端分页，每页 15 条，按 `updated` 倒序。
- 标题/正文搜索在服务端应用于分页列表，并在本地应用于最多六篇置顶文档。
- 列表项显示标题、项目/个人上下文和 revision。
- 可访问文档支持置顶/取消置顶。
- 归档和永久删除只对创建者开放；删除确认明确说明所有版本都会移除。
- 归档对话框每页 10 条，创建者可恢复或永久删除文档。
- 文档 URL 使用统一的 `record` 查询参数，支持从 Chat、Board、Dashboard 和其他模块深链接打开。

## 9. HTTP API

- `POST /api/docs`
- `PUT /api/docs/{id}`
- `POST /api/docs/{id}/move-to-project`
- `GET /api/docs-pinned`
- `POST /api/docs/{id}/pin`
- `POST /api/docs/{id}/archive`
- `POST /api/docs/{id}/unarchive`
- `DELETE /api/docs/{id}`
- `GET /api/docs/{id}/versions`
- `GET /api/docs/{id}/versions/{revision}`
- `POST /api/docs/{id}/restore/{revision}`

所有接口都要求 `users` 认证。对于无权访问的个人/项目文档，适用接口使用未找到语义，避免泄露记录是否存在。

## 10. Assistant 工具

- `docs_search`：按标题/正文搜索可见活动文档，返回元数据和摘要；默认 20 条，最多 50 条。
- `docs_get`：返回完整的当前 Markdown 和 revision。
- `docs_upsert`：创建文档，或使用 `baseRevision` 完整替换已有文档。
- `docs_replace`：使用 `baseRevision` 替换第一个或全部精确 Markdown 匹配。

Assistant 更新前必须调用 `docs_get`，使用返回的 revision，对同一文档串行写入，并且不能覆盖冲突。成功的 AI 变更创建来源为 `ai` 的版本；无变化 upsert 和无匹配 replace 不创建版本。

## 11. Board 集成

`board_tasks.documents` 最多关联 20 篇文档。服务端只接受 `project` 与任务项目一致的文档。Board 选择器列出活动项目文档，任务活动以文档标题记录关联变化；删除文档时自动移除任务关系，但不删除任务。

## 12. 验收标准

- 个人和项目文档遵循服务端权限矩阵。
- 创建和每次发生变化的明确保存都会创建匹配的不可变 revision。
- 无变化保存不创建版本，过期保存不能静默覆盖新内容。
- Realtime 变化会保留有修改的本地草稿，并刷新干净的文档。
- Rich text、Source、Diff、全屏、历史预览和恢复都作用于权威 Markdown。
- 搜索、分页、个人置顶、归档、取消归档和永久删除遵守上限与所有权规则。
- Chat 文档写入遵守权限和乐观并发控制。
- Board 任务只接受同项目文档关联，并在关联文档删除后继续保留。
