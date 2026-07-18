# Docs 产品需求文档

[English](./docs-prd.md)

> 实现状态：当前 Workavera `0.0.2` 工作区行为，更新于 2026-07-18。

## 1. 产品目的

Docs 是 Workavera 的可复用知识与成果层，以 Markdown 或自包含 HTML 保存个人笔记和 Board 项目文档，提供与文档类型相匹配的编辑和预览体验、明确保存的版本历史和并发覆盖保护，并允许 Chat 使用相同权限与 revision 规则创建或修改文档。

项目文档可以关联到同一项目中的 Board 任务。

## 2. 目标

- 创建个人 Markdown 文档或自包含 HTML 应用，也可以通过 Board 项目共享。
- 文档类型创建后不可变，并在 `docs.content` 中持久化权威 Markdown 或 HTML 源码。
- 为 Markdown 提供 BlockNote 富文本/源码编辑，为 HTML 提供沙箱预览/源码编辑，并支持导出、附件和全屏。
- 只在用户或 AI 明确操作时保存，不自动向服务器写入正文。
- 每次发生内容变化的保存都创建不可变版本。
- 使用乐观 revision 校验检测并发编辑。
- 复用 Board Owner/成员角色控制项目文档权限。
- 支持个人一级文件夹、个人置顶、搜索、分页、归档、版本恢复和永久删除。
- 允许 Chat 搜索、读取、创建、完整更新、精确替换 Markdown，并分块写入大型文档。
- 允许 Board 任务关联本项目的活动文档。

## 3. 非目标

- 字符级实时协作、远程光标或在线状态。
- 自动服务器保存或定时创建版本。
- 评论、批注、提及或文档通知。
- 嵌套文件夹、项目内文件夹、双向链接、知识图谱、块引用或语义/向量搜索。
- 独立于 Board 项目成员的文档协作者。
- 持久化编辑器专用 JSON、MDX、JSX 或多文件 HTML 应用包。
- 公开发布。
- 将项目文档移回个人空间或直接移动到其他项目。

## 4. 核心规则

1. `docs.content` 是权威正文，格式由创建后不可变的 `kind`（`markdown` 或 `html`）决定。
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
12. 置顶是用户个人偏好，每位用户最多置顶十篇可访问文档。
13. 归档文档不可编辑，不进入普通搜索和置顶结果。
14. `project` 与 `folder` 互斥；两者都为空的文档直接位于 `My documents`。
15. 个人文件夹仅用于 Owner 的个人文档；删除文件夹会将文档移回 `My documents`，不会删除文档或创建版本。
16. HTML 文档必须保持自包含，并在不透明来源的沙箱中渲染；开发服务器资源引用会被拒绝。

## 5. 数据模型

### `docs`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` | text | 必填，最长 240 个字符 |
| `kind` | select | 创建后不可变的 `markdown` 或 `html` |
| `content` | text | 权威 Markdown 或自包含 HTML，最大 1 MiB |
| `owner` | relation → users | 创建者和个人文档 Owner，级联删除 |
| `project` | relation → board_projects | 个人文档为空 |
| `folder` | relation → doc_folders | 可选，仅用于个人文档 |
| `status` | select | `draft` 或 `archived` |
| `revision` | number | 从 1 开始的正整数 |
| `last_edited_by` | relation → users | 最近一次有变化保存的操作者 |
| `created`、`updated` | autodate | 记录时间 |

索引支持按 Owner、项目、文件夹、状态和最近更新时间查询。PocketBase list/view 规则只向 Owner 暴露个人文档，并向项目参与者暴露项目文档。客户端 Records API 通常禁止写入；例外是活动个人文档的 `folder` 字段，Owner 可以修改它，服务端规则和 Hook 禁止同时设置项目、使用他人文件夹或修改其他文档字段。

### `doc_folders`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | text | 必填，最长 80 个字符；同一 Owner 下不区分大小写唯一 |
| `owner` | relation → users | 文件夹 Owner，级联删除 |
| `created`、`updated` | autodate | 记录时间 |

文件夹使用 PocketBase 内置 CRUD 和 Owner API Rules。文件夹仅一级且按名称排序。删除文件夹时，可空且非级联的 `docs.folder` 关系由 PocketBase 自动清空。

### `doc_assets`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `doc` | relation → docs | 必填，级联删除 |
| `file` | protected file | 一个允许的图片、文档或压缩文件，最大 10 MiB |
| `kind` | select | `image` 或 `file` |
| `original_name`、`media_type`、`size` | metadata | 原始上传元数据 |
| `sha256` | hidden text | 去重摘要，与文档和原始文件名组合唯一 |
| `uploaded_by` | relation → users | 上传附件的编辑者 |
| `created` | autodate | 上传时间 |

附件继承文档可见性。上传使用已认证的 Docs 附件接口，要求文档编辑权限并拒绝不支持的媒体类型；附件随文档删除。Markdown 保存受保护的附件链接，导出 HTML 时会把图片解析为自包含资源。

### `doc_versions`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `doc` | relation → docs | 必填，级联删除 |
| `revision` | number | 与 `doc` 组合唯一 |
| `title` | text | 标题快照 |
| `content` | text | 与文档类型一致的正文快照，最大 1 MiB |
| `created_by` | relation → users | 发起保存的用户 |
| `source` | select | `user`、`ai` 或 `restore` |
| `created` | autodate | 保存时间 |

版本列表按 revision 倒序返回最多 100 条，不包含完整正文；单个版本接口返回完整正文。

### `doc_pins`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user` | relation → users | 置顶用户，级联删除 |
| `doc` | relation → docs | 被置顶文档，级联删除 |
| `created` | autodate | 置顶时间 |

`user + doc` 唯一。置顶写入使用 Docs API，在事务中校验十篇上限和文档访问权。

## 6. 保存与并发行为

### 创建

`POST /api/docs` 接收标题、创建后不可变的文档类型、权威正文，以及互斥的可选项目 ID 或个人文件夹 ID。两者都为空时文档位于 `My documents`。服务端校验用户、对应类型的正文和目标位置后，在同一事务中创建当前文档和 revision 1 版本。

### 保存

`PUT /api/docs/{id}` 接收完整标题、与已有类型一致的完整正文和 `baseRevision`。

服务端在同一事务中：

1. 校验访问权、编辑角色和非归档状态；
2. 比较 `baseRevision` 与当前 revision；
3. 标题和正文无变化时直接返回；
4. revision 加一、更新 `last_edited_by` 并保存文档；
5. 创建相同 revision 和对应来源的版本。

收到 HTTP 409 时，编辑器保留本地草稿、显示 `New version available`，并提供 `Load latest`。只有本地草稿干净时，realtime 事件才会自动加载文档。

### 恢复

History 对话框可预览所选 revision 的正文。恢复操作要求提交当前 base revision，并创建来源为 `restore` 的新版本；已有历史保持不变。

### 移入项目

只有个人文档 Owner 可以移动文档。个人文档在 `My documents` 与自己的一级文件夹之间通过 PocketBase Records API 移动。目标项目必须授予 Owner、Admin 或 Member 权限；移入项目时清空文件夹。移动只改变位置或访问范围，不改变正文 revision，也不创建版本。项目文档不能移回个人空间或直接移动到其他项目。

## 7. 编辑器体验

Markdown 文档使用带应用自有文档结构的 BlockNote；HTML 文档使用源码编辑器和沙箱预览。

- Markdown 默认使用富文本模式，并序列化回同一份权威 Markdown；Source 直接编辑该字符串。
- BlockNote 通过工具栏和斜杠菜单提供结构化文本、标题、格式、链接、列表、引用、代码块、表格、分隔线、图片和文件附件。
- 代码块按需加载语法语言；文件显示为下载卡片，图片在正文中显示。
- HTML 文档可在源码与预览之间切换。预览使用 `srcdoc`，且沙箱不包含 `allow-same-origin`，脚本无法访问父页面或 PocketBase 会话。
- Markdown 可导出为 `.md` 或自包含 `.html`；HTML 导出其源码为 `.html`。
- Fullscreen 使用浏览器 Fullscreen API 全屏显示编辑器区域。
- 标题可直接编辑，Header 显示 `vN`、`Unsaved · vN` 或新版本提示；Save 显示进行中状态。
- 存在未保存草稿时，切换文档或刷新页面会触发提示。草稿不写入本地存储。

同一个 `draftContent` 驱动各类型的源码与渲染模式。切换模式、预览、导出、上传附件和移动位置都不会保存正文或增加 revision。

## 8. 列表、归档与历史体验

- 左侧严格分为 Pinned、Recent、Locations 三种模式。切换模式或位置，以及归档或删除当前文档后，编辑区保持未选择状态，直到用户主动选择文档；明确的文档深链接仍直接打开目标文档。
- Pinned 最多显示十篇用户置顶文档，不显示位置选择或分页；Recent 固定显示最近编辑的十篇可访问文档，也不显示位置选择或分页。
- Locations 使用带分组层级、最高高度和滚动能力的位置下拉，包含 `My documents` 根目录、个人一级文件夹，以及按用户 Board 顺序排列的活动项目；仅 Locations 使用 PocketBase 服务端分页，每页 15 条。
- 标题/正文搜索限定在当前模式。Locations 在当前位置的服务端分页列表中搜索；Pinned 和 Recent 仍最多保留十条。AI 搜索默认返回 20 条、最多 50 条。
- 列表项显示标题、项目/个人上下文和 revision。
- 可访问文档支持置顶/取消置顶。
- 归档和永久删除只对创建者开放；删除确认明确说明所有版本都会移除。
- 归档对话框每页 10 条，创建者可恢复或永久删除文档。
- 文档 URL 使用共享的 `open` 查询参数，支持从 Chat、Board、Dashboard 和其他模块深链接打开，并使用 `view` 和可选的 `location` 保存 Docs 导航状态。

## 9. HTTP API

- `POST /api/docs`
- `PUT /api/docs/{id}`
- `POST /api/docs/{id}/assets`
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

个人文件夹通过 PocketBase `/api/collections/doc_folders/records` CRUD；个人文档的文件夹移动通过 `docs` Records API 更新唯一的 `folder` 字段。

## 10. Assistant 工具

- `docs_search`：按标题/正文搜索可见活动文档，可限定 `My documents`、个人文件夹或项目，返回元数据和摘要；默认 20 条，最多 50 条。
- `docs_get`：返回完整的当前正文、类型、revision，以及项目/文件夹位置。
- `docs_list_folders`：列出当前用户的个人文件夹，供创建或移动前解析 ID。
- `docs_upsert`：创建文档时可选择个人文件夹或项目，或使用 `baseRevision` 完整替换已有文档。`kind` 为必填；新建时若用户没有指定类型，Assistant 会先简短询问选择简单易编辑的 Markdown，还是丰富可交互的 HTML。
- `docs_move`：仅在用户明确要求整理或移动时，通过必填 `items` 数组将 1 至 50 篇个人文档移到 `My documents`、已有个人文件夹或可编辑项目；单条移动使用一个元素，不能移动项目文档，且拒绝旧的顶层单文档输入。各项按顺序执行并独立返回结果。
- `docs_replace`：使用 `baseRevision` 替换第一个或全部精确 Markdown 匹配。
- `docs_write_chunk`：按 replace/append 顺序写入过大的 Markdown 或 HTML 正文，并只记录一个逻辑版本。

Assistant 更新前必须调用 `docs_get`，沿用返回的 kind 和 revision，对同一文档串行写入，并且不能覆盖冲突。成功的 AI 变更创建来源为 `ai` 的版本；无变化 upsert 和无匹配 replace 不创建版本。

## 11. Board 集成

`board_tasks.documents` 最多关联 20 篇文档。服务端只接受 `project` 与任务项目一致的文档。Board 选择器列出活动项目文档，任务活动以文档标题记录关联变化；删除文档时自动移除任务关系，但不删除任务。

## 12. 验收标准

- 个人和项目文档遵循服务端权限矩阵。
- 创建和每次发生变化的明确保存都会创建匹配的不可变 revision。
- 无变化保存不创建版本，过期保存不能静默覆盖新内容。
- Realtime 变化会保留有修改的本地草稿，并刷新干净的文档。
- BlockNote 富文本/源码、HTML 源码/沙箱预览、导出、全屏、历史预览和恢复都作用于对应类型的权威正文。
- 搜索、分页、个人置顶、归档、取消归档和永久删除遵守上限与所有权规则。
- 个人文件夹使用 PocketBase CRUD；文件夹删除和文档移动不会删除文档或增加 revision。
- 附件上传会校验编辑权限、媒体类型、大小、受保护访问和去重，并随文档级联删除。
- Chat 文档写入遵守权限和乐观并发控制。
- Chat 可一次移动最多 50 篇符合条件的文档，单元素批次正常工作，并保留有序的成功和失败结果。
- Board 任务只接受同项目文档关联，并在关联文档删除后继续保留。
