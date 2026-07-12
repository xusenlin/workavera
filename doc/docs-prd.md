# Docs 模块 PRD

## 1. 背景

Workavera 面向个人开发者和小团队，通过 AI 将聊天、任务、外部资料和团队上下文连接成轻量、可自托管的工作流。

Docs 是工作沉淀层和发布层，用于把 Chat 对话、Reading 外部资料、Board 项目过程以及联系人沟通中的有效信息保存为可搜索、可复用的内部文档。首版不建设通用知识库或完整协作套件，优先完成 Markdown 文档的创建、编辑、共享、版本和 AI 使用闭环。

## 2. 目标

- 用户可以创建个人文档或关联 Board 项目的项目文档。
- 文档正文以 Markdown 字符串作为唯一持久化格式。
- 使用 Milkdown Crepe 提供接近普通文档的所见即所得编辑体验，不要求用户直接编辑 Markdown 源码。
- 有需要的用户可以切换到 Source 模式，直接编辑同一份 Markdown 草稿。
- 用户可以使用 Diff 模式对比当前草稿与最近一次保存的 Markdown。
- 编辑内容只保存在当前页面草稿中；只有用户点击保存或 AI 明确保存时才写入服务器。
- 每次成功保存都产生一个不可变版本，并记录保存者和保存来源。
- 多人打开同一项目文档时，通过修订号检测冲突，防止后保存者静默覆盖其他人的修改。
- 项目文档复用 Board 的项目成员和角色权限，不维护第二套项目成员关系。
- Chat 可以在用户权限范围内搜索、读取、创建和更新文档。
- 文档能够作为后续生成 Board 任务和公开内容的稳定来源。

## 3. 非目标

- 首版不实现 Google Docs 式逐字实时协同、远程光标或在线成员状态。
- 首版不自动保存到服务器，也不按时间间隔自动创建版本。
- 首版不实现评论、批注、通知和 `@mention`。
- 首版不实现文件夹树、双向链接、知识图谱和块级引用。
- 首版不实现向量数据库或语义检索。
- 首版不实现自定义文档协作者；项目文档只使用项目权限，个人文档只属于创建者。
- 首版不保存编辑器 JSON、HTML 或 MDX，且不支持自定义 JSX 组件；Source 模式编辑的仍是普通 Markdown。
- 首版不实现图片和附件上传。
- 首版不实现公开发布；数据模型保留状态字段，发布能力后续单独设计。

## 4. 核心规则

1. `docs.content` 是文档正文的唯一持久化内容，格式为 Markdown。
2. `docs` 保存当前最新版，`doc_versions` 保存每次明确提交的不可变快照。
3. 打开文档后，标题和正文修改只进入前端草稿，不触发服务器写入。
4. 用户点击 Save 时创建版本；未修改内容时 Save 不创建重复版本。
5. AI 只有在用户明确要求创建或更新文档时才能保存并创建版本；生成建议或文档内改写预览不创建版本。
6. 每次保存必须提交打开或最后加载时的 `baseRevision`。
7. `baseRevision` 与服务端当前 `revision` 不一致时拒绝保存并返回冲突，不自动覆盖或合并。
8. 恢复历史版本不会回退版本号，而是以历史内容创建一个新版本。
9. 未关联项目的文档是个人文档，仅 owner 可读写。
10. 关联项目的文档对项目 owner 和成员可见；owner、admin 和 member 可编辑，viewer 只读。
11. 个人文档 owner 可以将文档转入自己有编辑权限的项目；转入后立即继承项目权限，且首版不能再转回个人文档或转入另一个项目。
12. 文档创建者可以归档或永久删除文档；永久删除必须二次确认。
13. 置顶是用户个人偏好，不影响其他项目成员；每位用户最多置顶 6 篇可访问文档。

## 5. 集合设计

Docs 业务集合使用 `docs` 和 `doc_` 前缀。

### 5.1 `docs`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `title` | text | 是 | 文档标题，最长 240 字符 |
| `content` | text | 否 | Markdown 正文 |
| `owner` | relation → users | 是 | 文档创建者及个人文档所有者 |
| `project` | relation → board_projects | 否 | 为空表示个人文档，有值表示项目文档 |
| `status` | select | 是 | `draft / archived`，首版默认 `draft` |
| `revision` | number | 是 | 当前修订号，从 1 开始递增 |
| `last_edited_by` | relation → users | 是 | 最近一次成功保存者 |
| `created` | autodate | 是 | 创建时间 |
| `updated` | autodate | 是 | 最近一次成功保存时间 |

建议索引：

- `owner, updated`
- `project, updated`
- `status, updated`

`title` 和 `content` 用于首版关键词搜索。若 PocketBase 当前 SQLite 能力无法通过 Records API 满足相关性排序，则由 Docs 自定义查询服务完成搜索，不提前引入外部搜索服务。

### 5.2 `doc_versions`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `doc` | relation → docs | 是 | 所属文档，文档删除时级联删除 |
| `revision` | number | 是 | 对应修订号 |
| `title` | text | 是 | 此版本标题快照 |
| `content` | text | 否 | 此版本 Markdown 快照 |
| `created_by` | relation → users | 是 | 保存该版本的用户；AI 保存时记录发起 AI 操作的用户 |
| `source` | select | 是 | `user / ai / restore` |
| `created` | autodate | 是 | 版本创建时间 |

约束与索引：

- `doc, revision` 唯一。
- `doc, created` 普通索引，用于按时间倒序加载历史。
- 版本记录禁止客户端直接新增、修改或删除，只能由 Docs 保存服务在事务中创建。

### 5.3 `doc_pins`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `user` | relation → users | 是 | 设置个人置顶的用户 |
| `doc` | relation → docs | 是 | 被置顶的文档，文档删除时级联删除 |
| `created` | autodate | 是 | 置顶时间 |

约束与规则：

- `user, doc` 唯一。
- 每位用户最多存在 6 条置顶记录，由服务端事务强制校验。
- 置顶是个人偏好，不能直接在共享的 `docs` 记录上保存 `pinned`。
- `doc_pins` 禁止通过 Records API 写入，只能使用 Docs 置顶接口。

## 6. 保存与版本

### 创建文档

1. 用户输入标题，可选择一个自己有编辑权限的项目。
2. 前端调用 Docs 创建接口。
3. 后端在事务中创建 `docs`，设置 `revision = 1`。
4. 同一事务创建 `doc_versions` revision 1，来源为 `user`。
5. AI 创建文档时执行相同流程，版本来源为 `ai`。

允许空正文，但标题不能为空。创建动作本身就是第一次明确保存，因此必须产生版本 1。

### 用户保存

前端提交：

```json
{
  "title": "Docs 模块 PRD",
  "content": "# Docs 模块 PRD\n...",
  "baseRevision": 3
}
```

后端在单一事务中：

1. 校验用户对文档的编辑权限。
2. 校验当前 `docs.revision == baseRevision`。
3. 校验标题或正文相对当前版本确实发生变化。
4. 将 `docs` 更新为新内容，revision 加 1，并更新 `last_edited_by`。
5. 创建相同 revision 的 `doc_versions`，来源为 `user`。
6. 返回新的文档和 revision。

无内容变化时返回当前文档，不创建版本。

### AI 保存

- Chat 工具先读取文档及其 revision。
- AI 完成内容生成后，以读取时的 revision 作为 `baseRevision` 一次性提交完整 Markdown。
- 保存成功产生一个 `source = ai` 的版本。
- 如果生成期间文档已被其他用户或 AI 保存，返回冲突；AI 不自动覆盖，也不声称更新成功。
- 文档页面中的 AI 建议默认只写入本地草稿，仍由用户点击 Save 后产生 `source = user` 的版本。

### 恢复版本

恢复历史版本必须是显式操作。假设当前 revision 为 8，用户恢复 revision 3：

- revision 3 至 8 保持不变。
- 使用 revision 3 的标题和正文创建 revision 9。
- 新版本的 `source` 为 `restore`，`created_by` 为当前用户。

### 转为项目文档

个人文档 owner 可以将文档转入一个自己有编辑权限的 Board 项目。

后端在事务中：

1. 校验当前用户是个人文档 owner，且文档当前没有 `project`。
2. 校验当前用户是目标项目 owner、admin 或 member；viewer 不能接收文档。
3. 更新 `docs.project`，owner 字段保留为原创建者。
4. 返回更新后的文档权限和项目信息。

转换只改变文档归属和访问范围，不改变标题或正文，因此不增加 revision，也不创建 `doc_versions`。转换成功后，项目成员立即按照项目角色获得访问权限。若原 owner 在之后失去该项目访问权，也将失去该文档及历史版本的访问权。

首版不允许项目文档转回个人文档，也不允许直接从一个项目转入另一个项目；如有需要，可以后续设计带明确权限和审计规则的 Move 操作。

## 7. 冲突处理与多人编辑

Docs 首版支持多人安全编辑，但不支持逐字实时协同。

示例：A 和 B 同时打开 revision 4。

1. A 点击 Save，保存成功，服务器变为 revision 5。
2. B 点击 Save，提交的 `baseRevision` 仍为 4。
3. 服务端返回 `409 Conflict`，同时返回 revision 5 的标题、正文、编辑者和更新时间。
4. B 的本地草稿保持不变，不被服务器内容覆盖。

冲突界面首版提供：

- 查看服务器最新版。
- 查看“我的草稿”和“最新版本”的并排内容。
- 复制我的草稿。
- 重新加载最新版。
- 用户手动合并后再次保存。

首版不提供一键强制覆盖。若后续增加覆盖，也必须由用户明确确认，并基于最新 revision 创建新版本。

Docs 页面通过 PocketBase realtime 订阅当前文档：

- 本地无修改时，提示有新版本并允许加载。
- 本地有未保存修改时，显示“服务器已有新版本”，保留本地草稿。
- realtime 事件不直接替换编辑器内容。

## 8. 编辑器

首版使用 `@milkdown/crepe`、`@milkdown/react` 和 `@milkdown/kit`。

Milkdown Crepe 基于 ProseMirror 和 remark，将 Markdown 呈现为所见即所得的文档编辑界面；应用通过 Markdown listener 接收完整 Markdown 字符串，不保存 ProseMirror 内部状态。编辑器颜色全部映射到 Workavera 的 Tailwind CSS variables，同时适配浅色和深色主题，不加载独立的固定明暗主题。

启用能力：

- H1 至 H3 标题。
- 粗体、斜体。
- 有序列表、无序列表和待办列表。
- 引用。
- 链接。
- 表格。
- 分割线。
- 围栏代码块。
- Markdown 快捷输入。
- Rich Text / Source / Diff 模式切换。
- 撤销和重做。

暂不启用：

- MDX、JSX 和 directives。
- Front matter 编辑器。
- 图片和附件。
- Sandpack。
- 历史版本之间的任意 diff；首版 Diff 只比较当前草稿与最近一次保存内容。
- AI 流式写入正文。

### Rich Text、Source 与 Diff 模式

- 默认进入 Rich Text 模式，以所见即所得方式编辑文档。
- 用户可以切换到 Source 模式直接编辑 Markdown 源码。
- 用户可以切换到 Diff 模式，比较当前本地草稿和最近一次保存的 Markdown。
- 三种模式操作同一个 `draftContent`，切换模式不保存、不创建版本，也不改变 `baseRevision`。
- Source 模式使用应用内的纯 Markdown textarea，与 Milkdown 共用同一份 `draftContent`。
- Source 内容变化时通过 Milkdown `replaceAll` 同步回 Rich Text；无法安全解析时保留源码并提示错误，不丢弃或自动修正用户输入。
- Save 在 Rich Text 和 Source 模式下行为一致，提交完整 Markdown 并创建一个版本。

### 编辑器状态

前端至少维护：

```text
persistedDocument   最近加载或成功保存的服务器内容
draftTitle          当前本地标题
draftContent        当前本地 Markdown
baseRevision        草稿基于的服务端修订号
dirty               标题或正文是否与 persistedDocument 不同
saving              是否正在保存
serverHasNewVersion 编辑期间是否收到更高 revision
```

`onChange` 只更新 `draftContent` 和 `dirty`。Save 按钮仅在 `dirty && !saving` 时启用。

离开存在未保存修改的文档时显示确认提示。首版不使用 `localStorage` 恢复草稿，避免引入未确认的数据生命周期；若实际使用中频繁出现误关闭丢失，再单独加入仅保存在本机的恢复草稿。

### 视觉风格

- 右侧编辑区使用扁平的三段结构：Header → 全宽编辑工具栏 → 正文，不使用卡片、纸张阴影或额外画布边框。
- Header 左侧是按内容宽度自适应、可直接点击编辑的标题，版本号或 `Unsaved · vN` 紧跟标题；History、Move to project 和 Save 位于右侧，不显示项目名称。
- 工具栏位于 Header 正下方，横向铺满、固定最小高度且禁止被长正文压缩。
- 工具栏由 Workavera 自己实现，使用 shadcn/ui 控件和 Hugeicons，通过 Milkdown command API 执行格式化，不使用 Crepe 默认工具栏图标。
- 正文标题、段落、列表、引用和代码块使用 Milkdown Crepe 原生排版；仅表格覆盖系统边框、表头、选中状态及明暗主题颜色，以保证可读性。
- 编辑器内容通过 `contentEditableClassName` 和 CSS Variables 匹配 Tailwind 主题及深色模式。
- 编辑状态显示版本号、`Unsaved · vN`、Saving 或 New version available。
- 文档编辑界面本身即为实时排版预览，不设置 Markdown 源码与预览分栏。
- Rich Text 是默认实时排版预览；Source 和 Diff 是用户主动切换的高级模式，不使用左右分栏。

## 9. 页面与用户流程

### 文档列表 `/docs`

首版包含：

- Pinned：展示当前用户个人置顶的文档，最多 6 篇，始终位于 Recent 之前。
- Recent：展示未置顶、未归档文档，按更新时间倒序。
- 文档列表使用 PocketBase Records API 原生分页，每页 15 条，并使用 `items / totalItems / totalPages`。
- 标题和正文关键词搜索通过 PocketBase filter 在服务端执行；置顶文档在最多 6 条的集合内过滤。
- 每条文档在 hover 时显示 `…` 菜单，提供 Pin/Unpin；仅创建者额外看到 Archive 和 Delete。
- 顶部归档入口打开 Archived documents 弹窗。
- New document 入口。

列表项展示标题、项目或 Private 标识和当前 revision；置顶文档显示 Pin 图标。

### 文档详情 `/docs/:id`

- Header 中可直接编辑标题，并紧邻显示当前 revision 或未保存状态。
- Header 下方依次为全宽编辑工具栏和正文。
- Save 按钮和保存状态。
- 版本历史入口。
- owner、admin、member 进入可编辑模式，viewer 进入只读模式。
- 对无权访问的文档返回 404 语义，避免暴露文档存在性。

### 创建文档

1. 点击 New document。
2. 输入标题。
3. 选择 Private 或一个有编辑权限的项目。
4. 点击 Create。
5. 服务端创建 revision 1，进入文档详情。

### 转为项目文档

1. 个人文档 owner 从文档菜单选择 Move to project。
2. 只能选择当前用户拥有编辑权限的项目。
3. 确认界面说明转换后项目成员将获得访问权限，且首版不能移回个人空间。
4. 转换成功后文档显示目标项目，revision 保持不变。

### 查看和恢复版本

- 版本列表按 revision 倒序展示。
- 展示保存时间、保存者以及 `User / AI / Restored` 来源。
- 点击版本查看只读内容。
- 有编辑权限的用户可点击 Restore，确认后创建一个新版本。

### 归档文档

- 只有文档创建者可以归档、恢复归档或永久删除文档；项目 owner/admin 不能管理其他创建者的文档生命周期。
- 归档只更新 `status`，不创建正文版本。
- 归档文档只读；恢复归档后可继续编辑。
- 归档弹窗支持分页、恢复和永久删除；永久删除需要二次确认。
- 永久删除同时级联删除历史版本和个人置顶记录。

## 10. 权限

| 文档类型 | 读取 | 编辑 | 归档/恢复 | 查看版本 |
| --- | --- | --- | --- | --- |
| 个人文档 | owner | owner | owner | owner |
| 项目文档 | 项目 owner 和成员 | owner、admin、member | 仅文档创建者 | 项目 owner 和成员 |
| 项目 viewer | 是 | 否 | 否 | 是 |

权限必须在服务端保存服务中再次校验，不能依赖前端隐藏按钮。

文档版本的读取权限继承当前文档权限。用户失去项目访问权后，也立即失去对应文档及其历史版本的访问权。

## 11. 后端接口

文档列表和详情读取可优先使用 PocketBase Records API。涉及原子 revision 校验和版本创建的操作使用 Docs 自定义接口，并通过 `apis.RequireAuth("users")` 保护。

建议接口：

```text
POST /api/docs                       创建文档及 revision 1
PUT  /api/docs/:id                   校验 revision 并保存新版本
POST /api/docs/:id/move-to-project   将个人文档转为项目文档
GET  /api/docs-pinned                获取当前用户最多 6 篇置顶文档
POST /api/docs/:id/pin               设置或取消当前用户的个人置顶
POST /api/docs/:id/archive           创建者归档文档
POST /api/docs/:id/unarchive         创建者恢复归档文档
DELETE /api/docs/:id                 创建者永久删除文档及其版本
POST /api/docs/:id/restore/:revision 恢复历史版本并创建新版本
GET  /api/docs/:id/versions          获取版本列表
GET  /api/docs/:id/versions/:revision 获取单个历史版本
```

所有写操作使用事务，确保 `docs.revision` 与 `doc_versions.revision` 始终一致。

## 12. Chat 与 AI 工具

首版增加四个工具：

### `docs_search`

- 在当前用户可访问的个人和项目文档中搜索标题与正文。
- 返回文档 ID、标题、项目、更新时间、revision 和匹配摘要。
- 不返回无权限文档的任何信息。

### `docs_get`

- 获取指定文档当前完整 Markdown 和 revision。
- 用于回答问题或为更新取得可靠基线。

### `docs_create`

- 创建个人或项目文档。
- 项目 ID 必须来自用户上下文或此前工具结果，不能猜测。
- 成功后创建 revision 1，来源为 `ai`。

### `docs_update`

- 提交完整 title、Markdown 和 `baseRevision`。
- 成功后创建来源为 `ai` 的新版本。
- revision 冲突时返回明确错误，不自动覆盖。

首版不提供 AI 归档、恢复版本或删除文档工具。

## 13. 与其他模块的边界

- Reading 负责保存外部链接、原文、摘要和关键点；当用户要求沉淀时，由 Chat 读取 Reading 内容并创建 Doc。Doc 不复制 Reading 的状态和标签体系。
- Board 负责行动推进；AI 可以从 Doc 中提取行动项并调用现有 Board 工具创建任务，但 Doc 不内嵌任务管理。
- Chat 是 AI 操作入口；Chat 消息不是文档版本，只有明确调用 Docs 创建或更新工具后才成为文档。
- Contacts 负责关系上下文；首版 Doc 不直接关联联系人，AI 可在权限范围内将联系人上下文写入正文。
- 发布是 Docs 的后续能力，首版不开放公开访问。

## 14. 验收标准

1. 用户可以创建个人文档，创建后存在 revision 1 的版本记录。
2. 有项目编辑权限的用户可以创建项目文档，viewer 不能创建或编辑。
3. 用户可以在 Milkdown Crepe 中以所见即所得方式编辑标题、段落、列表、引用、链接、表格和代码块，并在浅色与深色主题下保持一致的 Workavera 视觉。
4. 编辑过程中不会产生任何服务器写入或版本记录。
5. 刷新或离开有未保存修改的页面前会收到提示。
6. 点击 Save 后正文以 Markdown 保存，revision 加 1，并生成内容一致的版本记录。
7. 未修改内容时点击 Save 不产生新版本。
8. 两个用户基于同一 revision 保存时，第一个成功，第二个收到 409，且第二个用户的本地草稿不丢失。
9. PocketBase realtime 收到新版本时不会自动覆盖当前编辑器内容。
10. 用户可以查看有权限文档的历史版本，并将历史内容恢复为一个更高 revision 的新版本。
11. AI 可以搜索、读取、创建和更新当前用户有权限访问的文档。
12. AI 创建和更新分别产生来源为 `ai` 的版本；发生 revision 冲突时不会覆盖已有内容。
13. 个人文档对其他用户不可见；项目文档权限与 Board 项目角色一致。
14. 归档文档从默认列表消失且变为只读，恢复后可再次编辑。
15. 前端通过 typecheck 和 lint，后端迁移及 Docs 领域测试通过。
16. 用户可以在 Rich Text、Source 与 Diff 模式间切换；Diff 比较当前草稿和最近保存内容，切换本身不保存或创建版本。
17. Source 模式保存的 Markdown 能在重新打开后继续以 Source 模式原样编辑，并可在可解析时以 Rich Text 模式呈现。
18. 个人文档 owner 可以将文档转入有编辑权限的项目，转换不增加 revision；viewer、非 owner 以及无项目编辑权限的用户不能执行转换。
19. 转为项目文档后立即使用项目权限，首版不能转回个人文档或直接转入其他项目。
20. 文档列表通过 PocketBase 原生分页加载 Recent 文档，每页 15 条；搜索条件在服务端执行。
21. 用户可以个人置顶可访问文档，Pinned 与 Recent 分组展示，服务端拒绝第 7 篇置顶。
22. 项目文档的置顶不会影响其他成员；归档和永久删除严格只允许 `docs.owner`。
23. 文档 `…` 菜单支持 Pin/Unpin、Archive 和 Delete；Delete 在普通列表及归档弹窗中都必须二次确认。
24. 归档弹窗支持分页、恢复和永久删除；归档文档不出现在默认列表。
25. 编辑区按 Header → 全宽工具栏 → 正文排列，标题可直接编辑，版本状态紧邻标题，正文和工具栏不使用卡片布局。

## 15. 后续候选能力

以下能力不属于首版，需根据实际使用反馈决定：

- 公开发布和发布快照。
- 图片、附件和 PocketBase 文件存储。
- 文档来源和关联关系。
- AI 文档内建议及接受/拒绝 diff。
- 任意两个历史版本之间的文本 diff。
- 本机未保存草稿恢复。
- 自定义文档分享。
- 全文检索增强和语义搜索。
- Yjs/CRDT 实时协同。
