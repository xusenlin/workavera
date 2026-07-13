# Calendar 产品需求文档

[English](./calendar-prd.md)

> 实现基线：Workavera `0.0.2`，于 2026-07-13 按提交 `3684be1` 核验。

## 1. 产品目的

Calendar 是 Workavera 的时间承诺层，在一个界面中展示个人日历事件和当前用户可见的 Board 任务截止日期。事件编辑、重复展开、AI 操作和提醒调度统一使用管理员配置的系统时区。

## 2. 目标

- 创建、查看、编辑和删除个人私有事件。
- 展示当前用户有权访问且设置了截止日期的 Board 任务。
- 支持全天和定时事件、颜色、地点、描述、简单重复和提醒。
- 提供日、周、迷你月历和全部自定义事件视图。
- 使用 PocketBase 持久化事件，并实时同步事件与任务变化。
- 为配置提醒的事件实例发送去重的站内通知。
- 允许 Chat 查询日程以及创建或更新个人事件。

## 3. 非目标

- 共享事件、参与者、邀请或事件级可见范围。
- 外部日历导入、导出或同步。
- 复杂 RRULE、多星期日、重复结束日期或重复次数。
- 单独编辑或删除某次重复实例；修改始终作用于整个系列。
- 邮件、浏览器推送、短信或移动推送。
- 在 Calendar 中编辑或删除 Board 任务。
- 通过 Assistant 工具删除事件。

## 4. 日历项目类型

Calendar 在展示层合并两个数据源：

| 类型 | 数据来源 | 时间语义 | 交互 |
| --- | --- | --- | --- |
| Event | `calendar_events` | 定时或全天，可重复 | 打开事件编辑抽屉 |
| Task | `board_tasks` | 将 `due_date` 作为全天截止事项 | 在 Board 中打开任务 |

两类记录保持独立，前端键使用 `event:<id>` 和 `task:<id>` 命名空间。

## 5. 事件数据模型

### `calendar_events`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `owner` | relation → users | 必填，级联删除 |
| `title` | text | 必填，最长 240 个字符 |
| `description` | text | 可选，最长 10,000 个字符 |
| `start_at` | date | 必填时间点 |
| `end_at` | date | 必填，且必须晚于 `start_at` |
| `all_day` | bool | 全天展示标记 |
| `timezone` | text | 从 `system.timezone` 写入的 IANA 时区 |
| `location` | text | 可选地点或会议链接，最长 500 个字符 |
| `color` | select | `blue`、`green`、`amber`、`red` 或 `purple` |
| `recurrence_frequency` | select | `none`、`daily`、`weekly`、`monthly` 或 `yearly` |
| `recurrence_interval` | number | 正整数 |
| `reminder_minutes_before` | number | `-1`、`0`、`5`、`10`、`30`、`60` 或 `1440` |
| `created`、`updated` | autodate | 记录时间 |

事件按 `owner, start_at` 建立索引。

## 6. 时区与重复规则

- `configs/system.timezone` 是权威 IANA 时区，默认种子值为 `Asia/Shanghai`。
- 创建和更新事件时，服务端使用系统时区覆盖事件的 `timezone`。
- UI 将系统时区中的本地日期与时间转换为时间点后再持久化。
- AI 事件工具接收 `YYYY-MM-DDTHH:MM:SS` 本地时间，并按系统时区解析。
- 重复系列只保存一条主体记录，并按请求日期动态展开实例。
- 每日重复按日历日推进；每周重复保持星期一致。
- 每月重复保持日期，目标月份不存在该日期时跳过。
- 每年重复保持月日，2 月 29 日只在闰年出现。
- `recurrence_interval` 作用于所选周期，例如每两周一次。
- 非重复事件显示在开始日期；重复实例保持主体事件的持续时长。

## 7. 提醒与通知

通知调度器每六分钟运行一次，并使用系统时区。

- `reminder_minutes_before >= 0` 的事件在提醒时间到达后生成 `calendar_event` 站内通知。
- 重复事件会先在调度窗口附近展开，再判断提醒时间。
- 去重键包含事件 ID、实例开始时间和接收者，确保每个实例对 Owner 最多生成一条通知。
- 通知数据包含 `eventId`、`occurrenceDate` 和 `instanceStart`，用于深链接。
- 实时通知订阅会更新顶部下拉面板和 Notifications 页面。

Board 任务也会在截止日期当天 09:00 后生成 `task_due` 通知，已完成状态的任务除外。存在负责人时通知负责人；未分配任务通知项目 Owner。

## 8. 用户体验

- 页面顶部提供 Previous、Today、Next 和 New event。
- 左侧包含迷你月历、Day/Week 切换和 All custom events。
- 迷你月历标记包含展开后事件或任务截止事项的日期。
- 日视图和周视图优先展示全天任务截止事项，再按开始时间展示事件。
- All custom events 列出当前用户拥有的全部事件主体，包括重复系列，并按主体开始时间排序。
- 右侧事件抽屉编辑标题、日期、开始/结束时间、全天状态、重复、提醒、颜色、地点和描述。
- 编辑或删除重复事件时明确提示操作影响整个系列。
- 任务项展示项目、优先级和完成状态，并深链接到 Board。
- URL 使用统一的 `record` 查询参数；事件通知还可包含 `occurrence` 日期。

## 9. 权限与实时同步

- List/View：仅已登录的 Owner。
- Create：已登录用户只能为自己创建，服务端强制 `owner = auth.id`。
- Update/Delete：仅 Owner，且不能修改 Owner。
- Board 任务可见性继续遵循 Board 的项目 Owner/成员权限。

前端加载个人事件、可见的到期任务和系统时区，并订阅 `calendar_events` 与 `board_tasks`。记录变化会直接更新合并后的日历视图。

## 10. Assistant 工具

### `calendar_get_schedule`

- 接收 1 至 31 个去重的 `YYYY-MM-DD` 日期。
- 返回排序后的日期列表，包含全部个人事件实例和可见 Board 任务截止事项。
- 返回事件 ID、实例日期、实例开始/结束时间，以及项目、任务和完成状态信息。

### `calendar_create_event`

- 仅在用户明确要求时为当前用户创建事件。
- 开始和结束时间使用配置的系统时区本地时间。
- 与 UI 共享颜色、重复、间隔、提醒和时间校验规则。

### `calendar_update_event`

- 使用日程查询得到的事件 ID 更新当前用户自己的事件。
- 省略字段保持不变；空描述或地点清空对应字段。
- 修改作用于整个重复系列。
- 不能修改 Board 任务。

系统不注册 Calendar 删除工具。

## 11. 验收标准

- 个人事件保持私有，并可在刷新后恢复。
- 定时、全天和重复事件按配置的系统时区显示在正确本地日期。
- 服务端拒绝无效标题、时间范围、颜色、重复设置和提醒值。
- 编辑或删除重复事件影响整个系列。
- 可见 Board 截止事项正常显示，但不会变成可编辑的 Calendar 事件。
- 日、周、迷你月历和全部自定义事件视图保持一致。
- 符合条件的事件提醒与任务截止提醒按接收者和实例/日期生成唯一站内通知。
- 同一用户的两个会话可实时收到事件与通知变化。
- Assistant 日程结果与 UI 的时区、重复、可见性和完成状态规则一致。
