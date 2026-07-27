# 定时任务产品需求文档

[English](./scheduled-tasks-prd.md)

> 产品基线：Workavera `0.0.9`。状态：**提案，待评审**。

## 1. 目的

定时任务让用户保存一段提示词和一个执行周期，到点由助手在无人值守的情况下运行，使用该用户自己的工具和权限。

它解决的是一类现在做不到的事：每天早上把到期任务、日程和待读汇总成一份简报；每周回顾看板变化；有了 MCP 之后，定期从外部服务拉取内容并转成工作区记录。

## 2. 目标

- 让用户用一段提示词和一个周期定义一次重复执行的助手运行。
- 在无人审批的前提下，保持工作区的权限保证不被削弱。
- 让运行结果可回溯、失败可见、成本可控。
- 把工具集的组合方式从散落的方法整理成单一的声明式来源。

## 3. 非目标

- 通用自动化平台（触发器、分支、跨应用编排）。
- 让定时运行修改自己的调度或创建新的定时任务。
- 任意 cron 表达式（首版只提供固定周期）。
- 在无人值守运行中执行破坏性操作。
- 看板重复任务——那是独立的确定性功能，不应混入本功能。

## 4. 架构：工具集如何组织

这是本提案的核心，其余部分都建立在它之上。

### 4.1 现状与问题

工具集现在由两个手工组合的方法产出：

```go
func (f *Factory) ForActor(actorID string) []fantasy.AgentTool  // 29 个内置工具
func (f *Factory) ForChat(scope ToolScope) []fantasy.AgentTool  // ForActor + 记忆 + MCP 远程
```

加入定时任务后会出现第三个出口，而三个出口的差异是沿几个彼此正交的维度分布的：

| 出口 | 内置工具 | 记忆工具 | MCP 远程工具 | 破坏性工具 | 通知工具 |
| --- | --- | --- | --- | --- | --- |
| Chat | ✅ | 偏好开启时 | ✅ | ✅（交互式审批） | ❌ |
| API key（`/api/mcp`） | ✅ | ❌ | ❌ | 按 key 的 scope | ❌ |
| 定时任务 | ✅ | ❌ | ✅ | ❌ | ✅ |

再加一个方法会让问题变形而不是解决。真正的缺陷有两处：

**其一，暴露范围是隐式的。** 往 `ForActor` 里加一个工具，它会**同时**出现在 Chat 和第三方 API key 里，而作者不需要做任何表态。这是一个静默扩大攻击面的默认行为。

**其二，破坏性判定与工具定义分离。** `IsDestructive` 是一张硬编码名单：

```go
var destructiveTools = map[string]bool{
	"board_delete_task":     true,
	"calendar_delete_event": true,
}
```

新增一个删除类工具而忘了登记，`allow_destructive` 为 false 的 API key 就能调用它。名单与它描述的对象之间没有任何强制关联。

### 4.2 方案：让每个工具自己声明暴露范围

把组合规则从「方法体里的代码」变成「工具旁边的声明」。

```go
// surface 是一个工具可以出现的出口。位掩码使得一个工具的暴露范围
// 是一处声明，而不是散落在若干个构造方法里。
type Surface uint8

const (
	SurfaceChat Surface = 1 << iota
	SurfaceAPIKey
	SurfaceScheduled
)

// toolSpec 把一个工具和它的暴露策略绑在一起。新增工具必须填写
// surfaces，否则它不会出现在任何地方——默认是不暴露，而不是全暴露。
type toolSpec struct {
	name        string
	surfaces    Surface
	destructive bool
	build       func(core.App, ToolScope) fantasy.AgentTool
}

var specs = []toolSpec{
	{name: "board_search_tasks", surfaces: SurfaceChat | SurfaceAPIKey | SurfaceScheduled,
		build: func(app core.App, s ToolScope) fantasy.AgentTool { return newBoardSearchTasksTool(app, s.ActorID) }},

	{name: "board_delete_task", surfaces: SurfaceChat | SurfaceAPIKey, destructive: true,
		build: func(app core.App, s ToolScope) fantasy.AgentTool { return newBoardDeleteTaskTool(app, s.ActorID) }},

	{name: "system_memory_upsert", surfaces: SurfaceChat, /* 仍需偏好开启 */ ...},
	{name: "system_notify_user", surfaces: SurfaceScheduled, ...},
}
```

三个出口退化成同一个函数的薄封装：

```go
func (f *Factory) For(surface Surface, scope ToolScope) []fantasy.AgentTool
```

### 4.3 这样解决了什么

- **暴露范围成为强制表态。** 新工具不写 `surfaces` 就哪里都不出现。默认从封闭变成事实，而不是靠代码评审。
- **破坏性判定与工具同处一行。** `destructive: true` 就在构造函数旁边，忘不掉。`IsDestructive` 改成查这张表，名单漂移的可能性消失。
- **矩阵可被测试锁定。** 一个测试断言完整的「工具 × 出口」矩阵。任何人新增工具而未分类，测试立刻失败并指出遗漏。这比现在那个只数总数的守卫强得多。
- **加新出口是加一列，不是加一个方法。** 将来若出现第四个出口（公开分享链接、webhook），需要做的是给每个工具决定一个位，而不是再手写一遍组合逻辑。

### 4.4 动态工具组

记忆工具和 MCP 远程工具不是静态构造的：前者取决于用户偏好，后者数量由用户配置决定。它们用同一套暴露声明，但走一个 provider 接口：

```go
type toolProvider struct {
	surfaces Surface
	build    func(core.App, ToolScope) []fantasy.AgentTool
}

var providers = []toolProvider{
	{surfaces: SurfaceChat, build: memoryTools},                                  // 受偏好门控
	{surfaces: SurfaceChat | SurfaceScheduled, build: mcpclient.ToolsForScope},   // 远程工具
}
```

关键在于：**判断「能不能出现在这个出口」和「这次要不要出现」是两件事**，前者由 `surfaces` 静态决定，后者由 `build` 在运行时决定。记忆工具即使偏好开着，也不会因此进入定时运行。

### 4.5 迁移路径

这是纯重构，可以在定时任务之前独立完成并验证：

1. 引入 `Surface`、`toolSpec`、`specs` 表，`ForActor` / `ForChat` 改为 `For(SurfaceAPIKey, …)` / `For(SurfaceChat, …)` 的封装，行为保持一致。
2. 现有测试（工具计数、名称清单）改为矩阵断言。
3. `IsDestructive` 改为查表，删除硬编码 map。
4. 之后再加 `SurfaceScheduled`。

## 5. 审批：无人值守时的取舍

Workavera 的安全模型建立在交互式审批之上——`RequireApproval` 阻塞等待人的决定。定时运行没有人。

`/api/mcp` 那条路径用 `WithAutoApprove` 绕过了它，其正当性是「API key 的 scope 就是预授权」。**定时任务没有这个预授权**：用户批准的是「每天运行这段提示词」，不是「批准它将来可能决定删除的任何东西」。

因此：**定时运行不提供破坏性工具**（`SurfaceScheduled` 位不设在它们身上），也不使用 `WithAutoApprove`。若某个工具在定时运行中仍调用 `RequireApproval`，`ErrApprovalUnavailable` 会让该次调用失败——这是正确的失败方式。

写入类的非破坏性操作（创建任务、写文档）允许，由任务自身的「允许写入」开关控制。

## 6. 数据模型

`scheduled_tasks`，归属所有者私有：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `owner` | relation → users | 必填，级联删除 |
| `name` | text | 显示名称 |
| `prompt` | text | 每次运行发给助手的提示词，最长 4000 字符 |
| `cadence` | select | `daily` / `weekdays` / `weekly` / `monthly` |
| `run_at` | text | `HH:MM`，按系统时区解释 |
| `weekday` / `day_of_month` | number | 供 `weekly` / `monthly` 使用 |
| `allow_writes` | bool | 关闭时只提供只读工具 |
| `output` | select | `notification` / `document` / `append` |
| `output_document` | relation → docs | `append` 时的目标文档 |
| `enabled` | bool | |
| `last_run_at` / `last_status` / `last_error` | | 最近一次运行的结果 |
| `consecutive_failures` | number | 连续失败计数，达阈值自动停用 |

每账号最多 10 个任务。

## 7. 执行

复用现有的 `app.Cron()` 循环（[notifications/scheduler.go](../internal/notifications/scheduler.go) 已在 `*/6 * * * *` 上运行），在其中检查到期任务，**不新增 cron 作业**——多个调度器只会让排查变难。时区取 `configs.SystemLocation`。

每次运行：

1. 新建一个会话，标题为任务名 + 日期。
2. 以 `SurfaceScheduled` 组装工具，按 `allow_writes` 进一步收窄。
3. 执行，最大步数低于交互式运行。
4. 会话完整保留，包含全部工具调用。

会话是产物的主体：现有的 Chat 界面已经能把看板、日程、阅读结果渲染成卡片，无需为定时任务重做一套呈现。

## 8. 通知工具

新增 `system_notify_user`，**仅在 `SurfaceScheduled` 出现**。交互式 Chat 里模型本来就在与用户对话，再给一个「发消息」工具纯属冗余。

它存在的理由不是「模型需要一个出口」——运行的最终文本本可直接作为通知内容——而是**让模型能够选择沉默**。「有逾期任务才告诉我」如果自动发送，用户每天都会收到「今天没有逾期」，一周内静音，然后真正有事的那天也看不见。**不调用即不打扰。**

输入：`title`、`body`、`urgent`。服务端强制：收件人恒为任务所有者、类型恒为 `scheduled_task`、`data` 中写入运行会话 ID。

通知本体只是一句话加一个跳转链接；富内容留在会话里。`notifications.body` 上限 4000 字符也印证这个定位。

`notifications.type` 目前是固定枚举（`model_share` / `task_due` / `calendar_event`），需要迁移新增 `scheduled_task`。

## 9. 输出去向

| 周期 | 建议 | 理由 |
| --- | --- | --- |
| 每日 | 仅通知 | 一年 365 个文档是垃圾；会话已可回溯 |
| 每周 / 每月 | 追加到滚动文档 | 会回头翻、会对比、会分享 |

`append` 优于每次新建：一个「周回顾」文档持续增长，比 52 个散落文件好找。实现复用 `docs_write_chunk`。

## 10. 成本与失效

- 每次运行消耗用户自己的模型额度。单账号任务数上限、单次运行步数上限。
- 模型不可用、MCP 服务器下线都是常态。连续失败达阈值自动停用并发通知——**静默失败的定时任务比没有更糟**。
- 单次运行设总时长上限，超时判失败。

## 11. 信任边界

定时运行会接触 MCP 远程工具的返回，而那是不可信内容。恶意服务器可能诱导模型发出一条看起来像系统告警的通知。

因此通知界面**必须标注来源为具体的定时任务**，不得与系统通知混同。Chat 的系统提示中关于外部内容的规则同样适用于定时运行。

## 12. 验收标准

- 工具的暴露范围由声明决定；未分类的新工具不出现在任何出口，且测试失败。
- `IsDestructive` 的结论来自工具声明，不存在独立名单。
- 定时运行中不存在破坏性工具，且不使用 `WithAutoApprove`。
- 记忆工具不出现在定时运行中，无论用户偏好如何。
- 每次运行产出一个完整可回溯的会话。
- 未调用通知工具的运行不产生任何通知。
- 连续失败达阈值的任务被自动停用并通知所有者。
- 定时任务产生的通知在界面上可与系统通知区分。
- 用户无法读取或修改他人的定时任务。
