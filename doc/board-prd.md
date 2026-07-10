# Board 模块 PRD

## 1. 背景

当前 Board 前端使用本地 Zustand 数据，流程状态固定为 `Todo / In Progress / Testing / Done`。本次改造将 Board 数据迁移到 PocketBase，并让每个项目拥有独立、可编辑的流程。

## 2. 目标

- 项目可从内置模板创建，也可创建空项目；数据模型同时支持后续加入个人模板管理。
- 模板中的状态和标签仅在创建项目时复制，之后与项目完全独立。
- 用户可以在项目中新增、编辑、排序和删除状态。
- 任务必须属于项目中的一个状态；空项目不能创建任务。
- 项目、状态、任务、成员和标签通过 PocketBase 实时同步。
- 保留现有任务标题、描述、优先级、标签、负责人和截止日期能力。
- `board_projects.owner` 是项目所有权的唯一数据来源，成员表只保存协作者。
- 项目 owner 可以维护项目设置、流程、标签和成员，并可将所有权转移给任意用户。
- owner 与成员都属于项目参与者，可被指派任务；任务和项目详情可以查看服务端生成的操作记录。

## 3. 非目标

- 模板变更不自动同步到已有项目。
- 首版不提供“套用新模板到已有项目”。
- 首版不提供状态删除时的任务自动迁移；状态存在任务时拒绝删除。
- 首版不实现评论、附件和通知。

## 4. 核心规则

1. 项目允许没有状态。
2. `board_tasks.state` 必填，因此项目没有状态时不能创建任务。
3. 任务的项目必须与状态的项目一致。
4. 状态存在任务时不能删除。
5. 模板没有运行时关联；项目不记录来源模板。
6. 公共模板的 `owner` 为空，个人模板的 `owner` 为用户 ID。
7. 普通用户只能读取公共模板，不能修改或删除。
8. 项目 owner 仅保存在 `board_projects.owner`，不得在 `board_project_members` 中创建重复记录。
9. 项目参与者集合为 `project.owner + project members`，按用户 ID 去重。
10. 任务负责人必须是项目 owner 或项目成员。
11. 只有当前 owner 可以编辑项目设置或转移所有权；转移后原 owner 自动成为普通 member。

## 5. 集合设计

所有 Board 业务集合使用 `board_` 前缀，认证集合 `users` 保持不变。

### 5.1 `board_templates`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | text | 是 | 模板名称 |
| `description` | text | 否 | 使用场景说明 |
| `owner` | relation → users | 否 | 空为公共模板，有值为个人模板 |
| `states` | json | 是 | 有序状态定义数组 |
| `labels` | json | 否 | 默认标签定义数组 |

状态定义包含 `name`、`color`、`category`；标签定义包含 `name`、`color`。

`category` 可选值：

- `pending`：尚未开始
- `active`：处理中
- `completed`：已完成

### 5.2 `board_projects`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | text | 是 | 项目名称 |
| `description` | text | 否 | 项目说明 |
| `owner` | relation → users | 是 | 项目所有者 |
| `archived` | bool | 否 | 是否归档 |

### 5.3 `board_project_states`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `project` | relation → board_projects | 是 | 所属项目 |
| `name` | text | 是 | 状态名称 |
| `color` | text | 是 | 状态颜色 |
| `category` | select | 是 | `pending / active / completed` |
| `sort_order` | number | 是 | 列排序值 |

同一项目内状态名称唯一。排序初始间隔为 1024。

### 5.4 `board_project_members`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `project` | relation → board_projects | 是 | 所属项目 |
| `user` | relation → users | 是 | 成员 |
| `role` | select | 是 | `admin / member / viewer` |

`project + user` 唯一。项目 owner 不写入本集合，且不能被重复添加为成员。

### 5.5 `board_project_labels`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `project` | relation → board_projects | 是 | 所属项目 |
| `name` | text | 是 | 标签名称 |
| `color` | text | 是 | 标签颜色 |

同一项目内标签名称唯一。

### 5.6 `board_tasks`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `project` | relation → board_projects | 是 | 所属项目 |
| `state` | relation → board_project_states | 是 | 当前状态 |
| `title` | text | 是 | 任务标题 |
| `description` | text | 否 | 任务描述 |
| `priority` | select | 是 | `low / medium / high / urgent` |
| `rank` | number | 否 | 当前列中的排序值 |
| `due_date` | date | 否 | 截止日期 |
| `assignees` | multi relation → users | 否 | 负责人 |
| `labels` | multi relation → board_project_labels | 否 | 标签 |
| `created_by` | relation → users | 是 | 创建者 |

索引：`project, state, rank`。

### 5.7 `board_task_operation_logs`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `project` | relation → board_projects | 是 | 所属项目 |
| `task_id` | text | 是 | 任务 ID 快照，任务删除后仍保留 |
| `task_title` | text | 是 | 操作发生时的任务标题 |
| `actor` | relation → users | 否 | 操作用户 |
| `actor_name` | text | 是 | 操作用户名称快照 |
| `action` | select | 是 | `create / update / move / delete` |
| `changes` | json | 否 | 字段变更前后值 |
| `created` | autodate | 是 | 操作时间 |

日志只允许项目参与者（Owner 或成员）读取，由服务端任务 Hook 创建，Records API 禁止客户端新增、修改和删除。

### 5.8 `board_project_operation_logs`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `project` | relation → board_projects | 是 | 所属项目 |
| `actor` | relation → users | 否 | 操作用户 |
| `actor_name` | text | 是 | 操作用户名称快照 |
| `action` | select | 是 | 项目、状态、标签、成员及 Owner 转移操作类型 |
| `changes` | json | 否 | 操作对象快照及字段变更前后值 |
| `created` | autodate | 是 | 操作时间 |

支持的操作类型：

- `transfer_owner`
- `update_project`
- `create_state / update_state / delete_state`
- `create_label / update_label / delete_label`
- `add_member / update_member / remove_member`

Owner 转移日志在转移事务中创建；其他项目活动由服务端 Record Request Hook 创建。项目 owner 和成员可读，Records API 禁止客户端新增、修改和删除。

## 6. 内置模板

### Software Development（默认）

- 状态：Todo、In Progress、Testing、Done
- 标签：Bug、Feature、Design、Docs、Refactor、API、Performance

### Simple Kanban

- 状态：Backlog、In Progress、Done
- 标签：Blocked、Improvement

### Content Production

- 状态：Ideas、Drafting、Review、Published
- 标签：Article、Video、Social、Campaign

### Issue Tracking

- 状态：Reported、Triaged、In Progress、Verification、Resolved
- 标签：Bug、Incident、Regression、Security

## 7. 用户流程

### 创建项目

1. 输入名称和描述。
2. 选择一个模板或 Blank Project。
3. 后端在事务中创建项目，将当前用户写入 `board_projects.owner`，并复制模板状态和标签；不创建 owner 成员记录。
4. 打开新项目；空项目展示添加状态引导。

### 管理 Owner 和成员

- Edit Project 将 Owner 与 Members 分区展示，Owner 不出现在成员列表中。
- 只有当前 Owner 可以打开项目编辑入口、管理成员和删除项目。
- Owner 可以从所有有效用户中选择新 Owner，并在确认对话框中完成转移。
- 转移在单一数据库事务中完成：移除新 Owner 已有的成员记录、更新项目 Owner、将原 Owner 写为普通 member，并创建审计日志。
- 转移成功后原 Owner 失去项目设置编辑权限，但仍以 member 身份参与项目。
- Project Activity 同时记录成员新增、移除和角色调整。

### 编辑流程

- 从项目菜单打开 Configure workflow。
- 可修改状态名称、颜色、语义分类。
- 可新增状态并调整顺序。
- 删除有任务的状态时显示阻止原因。
- 状态新增、编辑、排序和删除均写入 Project Activity。

### 管理标签

- 从项目菜单打开 Manage labels。
- 可新增、改名、改色和删除标签。
- 删除已使用标签时先从相关任务移除，并生成任务标签变更日志。
- 标签新增、编辑和删除同时写入 Project Activity。

### 创建和移动任务

- 从状态列中创建任务，状态必填。
- 负责人候选列表为项目 Owner 与成员的合并结果，Owner 无需成员记录也可被指派。
- 拖拽跨列时同时更新 `state` 和 `rank`。
- rank 使用间隔排序，正常拖拽只更新当前任务。
- 编辑任务时在 Activity 区域按时间倒序展示创建、移动和字段变更。

## 8. 实时同步

Board 页面订阅：

- `board_projects`
- `board_project_states`
- `board_project_members`
- `board_project_labels`
- `board_tasks`

任务详情打开时按 `task_id` 加载并订阅 `board_task_operation_logs`，关闭详情后取消该订阅。

Edit Project 打开时按 `project` 加载并订阅 `board_project_operation_logs`，在 Project Activity 中展示项目名称或描述、流程状态、标签、成员和 Owner 转移记录。

实时事件按记录 ID 执行 upsert/delete。前端操作使用乐观更新，失败时重新加载对应数据；断线重连后执行一次完整刷新。

## 9. 权限

- owner：项目设置、成员、流程、标签、任务和所有权转移的全部权限；其身份只来自 `board_projects.owner`。
- admin：任务管理；流程和标签管理首版仍由 owner 负责。
- member：任务管理。
- viewer：只读。
- 个人模板仅 owner 可写；公共模板仅管理员可写。

所有写入都需要服务端校验跨项目关系，不能依赖前端。

## 10. 验收标准

- 可使用四套内置模板或空白方式创建项目。
- 不同项目拥有完全独立的状态和标签。
- 项目状态可以新增、编辑、排序和删除。
- 项目标签可以新增、编辑和删除。
- 任务创建、状态移动、字段修改和删除由服务端写入只读操作日志。
- 任务详情可以加载并实时显示 Activity 时间线。
- Owner 在成员表中没有重复记录，但仍可被指派任务并计入项目参与人数。
- 只有 Owner 可以编辑项目，并可将所有权转移给任意有效用户。
- 转移后新 Owner 唯一，原 Owner 成为 member，Project Activity 展示完整转移记录。
- 项目名称或描述、状态、标签和成员变更都由服务端写入只读 Project Activity。
- 空项目不能创建任务，并提供明确引导。
- 任务不能关联其他项目的状态或标签。
- 两个登录会话可实时看到项目、状态和任务变化。
- 刷新页面后数据由 PocketBase 恢复，业务数据不再依赖 localStorage。
