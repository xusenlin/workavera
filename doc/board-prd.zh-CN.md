# Board 产品需求文档

[English](./board-prd.md)

> 实现基线：Workavera `0.0.2`，于 2026-07-13 按提交 `3684be1` 核验。

## 1. 产品目的

Board 是 Workavera 的行动推进层，将 Chat、Docs、Reading 和 Contacts 中形成的计划转化为项目与任务，并管理负责人、流程、优先级、标签、截止日期、关联文档及审计记录。

Board 数据持久化在 PocketBase 中并实时同步。每个项目拥有独立的流程和标签；模板只在创建项目时复制。

## 2. 目标

- 创建空白项目，或使用内置的中英文模板创建项目。
- 由项目 Owner 管理流程、标签、成员和所有权。
- 允许具备权限的参与者创建、编辑、移动、排序和删除任务。
- 以 `board_projects.owner` 作为 Owner 的唯一数据来源，`board_project_members` 只保存协作者。
- 在服务端校验所有项目范围内的关联关系。
- 在只读活动集合中记录项目和任务变更。
- 在多个会话之间实时同步项目、状态、成员、标签和任务。
- 允许任务关联同一项目中的 Docs 文档。
- 向 Chat 提供感知权限且非破坏性的 Board 工具。

## 3. 非目标

- 将模板后续变化同步到已有项目。
- 向已有项目套用模板。
- 删除状态时自动迁移任务；包含任务的状态不可删除。
- 任务评论、文件附件、子任务、依赖关系或工时估算。
- 通过 AI 工具执行 Board 删除操作。
- 通过 AI 工具转移所有权；该操作保留在 UI 中并需要确认。

## 4. 角色与核心规则

项目参与者由项目 Owner 与去重后的成员记录组成。

| 角色 | 读取项目 | 编辑任务 | 管理流程、标签和成员 | 编辑/删除项目 | 转移所有权 |
| --- | --- | --- | --- | --- | --- |
| Owner | 是 | 是 | 是 | 是 | 是 |
| Admin | 是 | 是 | 否 | 否 | 否 |
| Member | 是 | 是 | 否 | 否 | 否 |
| Viewer | 是 | 否 | 否 | 否 | 否 |

核心约束：

1. 项目可以没有状态，但任务必须关联状态。因此空白项目在添加状态前不能创建任务。
2. 任务状态和标签必须属于任务所在项目。
3. 每位负责人必须是项目 Owner 或项目成员。
4. 每篇关联文档必须是同一项目中的项目文档；个人文档和其他项目文档会被拒绝。
5. 包含任务的状态不可删除。
6. Owner 不能同时存在于成员表中。
7. 只有当前 Owner 可以修改项目设置或转移所有权。
8. 转移所有权时，在同一事务中删除新 Owner 可能存在的成员记录、更新 `board_projects.owner`、将原 Owner 添加为 `member`，并写入转移记录。
9. 无论通过共享命令层还是 PocketBase Records API 写入，服务端 Hook 都会校验任务编辑权限。

## 5. 数据模型

### `board_templates`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | text | 必填，在 Owner 范围内唯一 |
| `description` | text | 可选的使用说明 |
| `owner` | relation → users | 内置模板为空，个人模板记录 Owner |
| `states` | JSON | 有序的 `name`、`color`、`category` 定义 |
| `labels` | JSON | `name`、`color` 定义 |

状态类别为 `pending`、`active` 和 `completed`。登录用户可读取内置模板；个人模板按 Owner 隔离。

### `board_projects`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | text | 必填，最长 160 个字符 |
| `description` | text | 可选，最长 2,000 个字符 |
| `owner` | relation → users | 必填，Owner 的唯一来源 |
| `archived` | bool | 归档后不显示在活动项目列表中 |
| `created`、`updated` | autodate | 记录时间 |

### `board_project_states`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `project` | relation → board_projects | 必填，级联删除 |
| `name` | text | 必填，同项目内唯一 |
| `color` | text | 必填 |
| `category` | select | `pending`、`active` 或 `completed` |
| `sort_order` | number | 列排序值；新状态按 1,024 间隔追加 |

### `board_project_members`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `project` | relation → board_projects | 必填，级联删除 |
| `user` | relation → users | 必填 |
| `role` | select | `admin`、`member` 或 `viewer` |

`project + user` 唯一，项目 Owner 不写入本集合。

### `board_project_labels`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `project` | relation → board_projects | 必填，级联删除 |
| `name` | text | 必填，同项目内唯一 |
| `color` | text | 必填 |

### `board_tasks`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `project` | relation → board_projects | 必填，级联删除 |
| `state` | relation → board_project_states | 必填 |
| `title` | text | 必填，最长 240 个字符 |
| `description` | text | 可选的 Markdown/纯文本，最长 10,000 个字符 |
| `priority` | select | `none`、`low`、`medium`、`high` 或 `urgent` |
| `rank` | number | 状态列内的顺序 |
| `due_date` | date | 可选截止日期 |
| `assignees` | multi-relation → users | 最多 20 位项目参与者 |
| `labels` | multi-relation → board_project_labels | 最多 20 个项目标签 |
| `documents` | multi-relation → docs | 最多 20 篇同项目文档 |
| `created_by` | relation → users | 创建时由服务端设置 |

删除关联文档只会解除关系，不会删除任务。任务搜索结果会将文档 ID 解析为标题。

### 活动记录集合

`board_task_operation_logs` 保存不可变的 `create`、`update`、`move` 和 `delete` 事件，包括任务快照、操作者快照和字段变化；文档变化以标题列表记录。

`board_project_operation_logs` 保存不可变的项目、流程、标签、成员及 `transfer_owner` 事件。两个集合都只允许项目参与者读取，禁止通过 Records API 修改。

## 6. 内置模板

系统预置五种流程的中英文版本，共十套模板。

| 流程 | 状态 | 默认标签 |
| --- | --- | --- |
| Software Development / 软件开发 | Todo、In Progress、Testing、Done | Bug、Feature、Design、Docs、Refactor、API、Performance |
| Simple Kanban / 简易看板 | Backlog、In Progress、Done | Blocked、Improvement |
| Content Production / 内容生产 | Ideas、Drafting、Review、Published | Article、Video、Social、Campaign |
| Issue Tracking / 问题跟踪 | Reported、Triaged、In Progress、Verification、Resolved | Bug、Incident、Regression、Security |
| Self-Media Operations / 自媒体运营 | Ideas、Creating、Scheduled、Published | Short Video、Article、Live Stream、Brand Partnership |

中文模板包含本地化名称和说明。模板复制到项目后，与模板不再存在运行时关联。

## 7. 用户体验

### 创建与设置项目

- 创建抽屉支持名称、描述、模板或空白流程、初始标签和成员。
- 项目创建在事务中完成，发起者成为 Owner。
- Owner 可以编辑项目、配置状态、管理标签和成员、查看 Project Activity、转移所有权及删除项目。
- 项目列表分页加载，仅加载当前页项目的子记录。

### 看板流程

- 任务按状态分组，并按 `rank` 排序。
- 同列或跨列拖拽会更新排序值，跨列时同时更新状态。
- 前端先执行乐观更新，再持久化到 PocketBase；失败时重新加载权威数据。
- 任务卡展示优先级、截止日期、负责人、标签和关联文档数量。
- 任务详情支持编辑所有任务字段，并按时间倒序展示活动记录。
- 文档选择器可搜索活动状态的项目文档，关联文档通过统一工作区深链接打开。

### 实时同步

Board 订阅 `board_projects`、`board_project_states`、`board_project_members`、`board_project_labels` 和 `board_tasks`。记录事件按 upsert/delete 应用；重连或乐观写入失败时重新加载。任务和项目活动在对应详情界面打开时加载。

## 8. HTTP 与 Records API

- `POST /api/board/projects`：在事务中创建空白项目或模板项目。
- `PATCH /api/board/projects/{id}/owner`：在事务中转移所有权。
- 项目、状态、标签、成员和任务的授权 CRUD 使用 PocketBase Records API。
- 服务端请求 Hook 校验所有权、角色、跨项目关系、状态删除和活动记录。

所有用户操作都要求通过 `users` 集合认证。

## 9. Assistant 工具

读取工具：

- `board_search_projects`
- `board_get_project`
- `board_search_tasks`
- `board_list_templates`

`board_search_tasks` 可在不提供项目 ID 时，按标题或描述关键词搜索调用者可见的全部活动项目。跨项目关键词结果默认返回 20 条，最多 50 条；归档项目需要显式包含。提供项目 ID 后仍可限定关键词、状态或负责人；在项目范围内省略关键词时继续返回该项目的完整任务列表。每条命中除 `stateId` 外还直接包含所属项目与完整状态，调用方不需要自行推断项目或二次匹配状态名称。

写入工具：

- `board_create_project`
- `board_update_project`
- `board_upsert_state`
- `board_upsert_label`
- `board_upsert_member`
- `board_create_task`
- `board_update_task`

`board_get_project` 返回调用者角色，以及 `canEditProject`、`canManageWorkflow`、`canManageMembers` 和 `canEditTasks` 能力。修改已有数据前必须先读取详情，以使用真实 ID 和最新状态。状态、标签、成员、任务创建和任务更新工具要求通过 `items` 数组提交 1 至 50 条记录；单条写入使用一个元素，旧的顶层单记录输入会被拒绝。服务端按顺序执行并返回逐条结果，因此某条无效记录不会隐藏或撤销同批次中已成功的记录。任务更新采用 patch 语义；空数组清空负责人、标签或文档，空截止日期清除截止时间。

系统不注册 AI 删除工具或所有权转移工具。破坏性操作必须由用户前往 Board 完成。

## 10. 验收标准

- 用户可以使用任意内置模板或空白方式创建独立项目。
- 只有 Owner 可以管理设置、成员、流程、标签和所有权。
- Admin 与 Member 可以编辑任务，Viewer 只读。
- 服务端拒绝其他项目的状态、标签、文档，以及非参与者负责人。
- Board 选择器可以关联或解除最多 20 篇任务所属项目的活动文档；服务端拒绝个人文档和跨项目文档，删除文档不会删除任务。
- 任务和项目活动准确记录成功变更，且客户端不能编辑活动记录。
- 两个登录会话可通过 PocketBase realtime 看到 Board 记录变化。
- 刷新页面后从 PocketBase 恢复数据，不依赖本地存储。
- Chat 可以查询 Board 并执行允许的非破坏性操作，同时遵守实时角色和权限。
- Chat 可在不知道项目时按任务标题或描述关键词搜索，并在一次结果中取得任务 ID、所属项目和状态。
- Chat 可在一次调用中创建或修改 1 至 50 条 Board 记录，单元素批次正常工作，部分成功时保留有序的逐条结果。
