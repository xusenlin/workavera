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
- 项目 owner 可以维护项目标签，任务详情可以查看服务端生成的操作记录。

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
| `role` | select | 是 | `owner / admin / member / viewer` |

`project + user` 唯一。项目创建时自动创建 owner 成员记录。

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

日志只允许项目成员读取，由服务端任务 Hook 创建，Records API 禁止客户端新增、修改和删除。

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
3. 后端在事务中创建项目、owner 成员，并复制模板状态和标签。
4. 打开新项目；空项目展示添加状态引导。

### 编辑流程

- 从项目菜单打开 Configure workflow。
- 可修改状态名称、颜色、语义分类。
- 可新增状态并调整顺序。
- 删除有任务的状态时显示阻止原因。

### 管理标签

- 从项目菜单打开 Manage labels。
- 可新增、改名、改色和删除标签。
- 删除已使用标签时先从相关任务移除，并生成任务标签变更日志。

### 创建和移动任务

- 从状态列中创建任务，状态必填。
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

实时事件按记录 ID 执行 upsert/delete。前端操作使用乐观更新，失败时重新加载对应数据；断线重连后执行一次完整刷新。

## 9. 权限

- owner：项目、成员、流程、标签、任务全部权限。
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
- 空项目不能创建任务，并提供明确引导。
- 任务不能关联其他项目的状态或标签。
- 两个登录会话可实时看到项目、状态和任务变化。
- 刷新页面后数据由 PocketBase 恢复，业务数据不再依赖 localStorage。
