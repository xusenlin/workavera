# Calendar 模块 PRD

## 1. 背景

Workavera 的 Board 已支持任务截止日期，但缺少统一的时间视图；现有 Calendar 页面仅使用前端 mock 数据。Calendar 首版将作为个人时间管理入口，统一展示个人事件和当前用户可见的 Board 到期任务。

## 2. 目标

- 用户可以创建、查看、编辑和删除仅自己可见的日历事件。
- Calendar 同时展示当前用户有权查看且设置了截止日期的 Board 任务。
- 事件支持按天、周、月、年进行简单重复。
- 事件可以保存一个提醒提前量，供后续通知系统消费。
- 数据通过 PocketBase 持久化并实时同步。

## 3. 非目标

- 首版不支持共享事件、参与者或事件可见范围。
- 首版不支持外部日历同步和事件来源字段。
- 首版不支持一周多天、重复截止日期、重复次数或复杂 RRULE。
- 首版不支持编辑或删除单个重复实例；操作始终作用于整个系列。
- 首版不实现后台、邮件或浏览器推送，只保存提醒设置。
- Calendar 不复制 Board 的任务管理能力，也不允许从 Calendar 删除任务。

## 4. 日历项目类型

Calendar 在展示层合并两种独立来源：

- `event`：来自 `calendar_events`，是用户创建的个人事件。
- `task`：来自 `board_tasks`，以 `due_date` 作为全天截止事项。

两种记录不共享数据库表，也不需要 `source_type` 或 `source_id`。前端列表键使用 `event:<id>` 和 `task:<id>`，点击事件打开事件编辑器，点击任务进入 Board。

## 5. `calendar_events` 集合

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `owner` | relation → users | 是 | 事件所属用户 |
| `title` | text | 是 | 事件标题 |
| `description` | text | 否 | 事件说明 |
| `start_at` | date | 是 | 开始时间 |
| `end_at` | date | 是 | 结束时间，必须晚于开始时间 |
| `all_day` | bool | 否 | 是否为全天事件 |
| `timezone` | text | 是 | 创建事件时的 IANA 时区 |
| `location` | text | 否 | 地点或会议链接 |
| `color` | select | 是 | `blue / green / amber / red / purple` |
| `recurrence_frequency` | select | 是 | `none / daily / weekly / monthly / yearly` |
| `recurrence_interval` | number | 是 | 重复间隔，最小为 1 |
| `reminder_minutes_before` | number | 是 | 提前分钟数；`-1` 表示不提醒 |
| `created` / `updated` | autodate | 是 | 时间戳 |

索引：`owner, start_at`。

## 6. 重复规则

重复系列只保存一条主体记录，并在当前日历范围内动态展开：

- `daily + 1`：每天重复。
- `weekly + 1`：每周在开始日期相同的星期重复。
- `monthly + 1`：每月在相同日期重复；月份不存在该日期时跳过。
- `yearly + 1`：每年在相同月日重复；2 月 29 日仅在闰年出现。
- `interval > 1`：每隔对应数量的周期重复。

重复事件不会自动结束。编辑和删除提示用户操作会影响整个系列，并直接更新或删除主体记录。

## 7. 提醒

事件编辑器提供：不提醒、开始时、提前 5 分钟、10 分钟、30 分钟、1 小时和 1 天。首版只保存 `reminder_minutes_before`；通知调度、送达和去重由后续通知模块实现。

## 8. 页面与交互

- 顶部提供 Today、上一周期、下一周期和 New event。
- 左侧迷你月历标记有内容的日期。
- 主区域首版提供日视图和周列表视图。
- 普通事件按开始时间排序；任务作为全天事项优先展示。
- 事件支持全天、日期、开始/结束时间、颜色、地点、描述、重复和提醒设置。
- 重复事件卡片显示重复标记；任务显示项目、优先级和完成状态。
- 完成状态通过 `board_project_states.category = completed` 判断。
- 任务不能在 Calendar 中删除或作为普通事件编辑。

## 9. 权限

- List/View：仅 `owner = @request.auth.id`。
- Create：必须登录，且 `owner = @request.auth.id`。
- Update：仅 owner，且不能修改 owner。
- Delete：仅 owner。
- Board 任务继续使用现有项目权限规则。

## 10. 验收标准

- 刷新页面后个人事件仍存在，其他用户无法读取或修改。
- 可创建、编辑和删除普通事件及整个重复系列。
- 日、周视图与迷你月历能展示范围内展开后的重复实例。
- 可见 Board 任务在截止日期当天显示为 task，且不会被事件编辑器修改或删除。
- 标题为空、结束时间不晚于开始时间等无效数据不能保存。
- 提醒和重复设置可持久化。
- 两个同用户登录会话可实时看到事件变更。

## 11. Calendar AI 工具

### `calendar_get_schedule`

- 输入一个 `dates` 数组，元素使用 `YYYY-MM-DD`，一次最多查询 31 个去重日期。
- 返回按日期分组的全部个人事件和当前用户可见的 Board 到期任务。
- 服务端展开简单重复事件，并返回事件主体 ID、实例开始时间和实例结束时间。
- Task 继续遵循 Board 项目的 owner/member 可见权限。

### `calendar_create_event`

- 为当前用户创建个人 `calendar_events` 记录。
- 定时事件必须提供明确的 RFC 3339 开始/结束时间和 IANA 时区。
- 颜色、重复频率、重复间隔和提醒规则与 Calendar UI 使用相同的校验。

### `calendar_update_event`

- 使用 `calendar_get_schedule` 返回的事件 ID 更新当前用户自己的事件。
- 未提供的字段保持不变，空描述或地点可以清空对应字段。
- 更新重复事件时作用于整个系列。
- 工具不能修改 Board Task，也不提供事件删除能力。
