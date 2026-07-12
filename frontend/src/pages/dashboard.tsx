import { NavLink } from "react-router"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis } from "recharts"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Task01Icon,
  ContactBookIcon,
  Chat01Icon,
  DocumentAttachmentIcon,
  ArrowUpRight01Icon,
  SparklesIcon,
  AiBrain02Icon,
} from "@hugeicons/core-free-icons"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { useAuthStore } from "@/store/auth"

type Stat = {
  label: string
  value: string
  change: string
  icon: typeof Task01Icon
  url: string
}

const stats: Stat[] = [
  { label: "Open Tasks", value: "12", change: "+3 this week", icon: Task01Icon, url: "/board" },
  { label: "Contacts", value: "48", change: "+6 this week", icon: ContactBookIcon, url: "/contacts" },
  { label: "Chats", value: "5", change: "2 active", icon: Chat01Icon, url: "/chat" },
  { label: "Documents", value: "9", change: "+1 this week", icon: DocumentAttachmentIcon, url: "/docs" },
]

// Mock: per-day token usage split by model
type ModelKey = "gpt4o" | "claude37" | "deepseek"

const tokenData = [
  { date: "Mon", gpt4o: 8200, claude37: 6400, deepseek: 6000 },
  { date: "Tue", gpt4o: 12400, claude37: 9800, deepseek: 8200 },
  { date: "Wed", gpt4o: 6100, claude37: 5200, deepseek: 4800 },
  { date: "Thu", gpt4o: 16800, claude37: 14200, deepseek: 13500 },
  { date: "Fri", gpt4o: 21400, claude37: 18600, deepseek: 13600 },
  { date: "Sat", gpt4o: 5200, claude37: 4100, deepseek: 4500 },
  { date: "Sun", gpt4o: 9800, claude37: 8400, deepseek: 7000 },
]

const modelMeta: { key: ModelKey; label: string; color: string }[] = [
  { key: "gpt4o", label: "GPT-4o", color: "var(--chart-1)" },
  { key: "claude37", label: "Claude 3.7 Sonnet", color: "var(--chart-2)" },
  { key: "deepseek", label: "DeepSeek V3", color: "var(--chart-3)" },
]

// Mock: daily tasks by status (pending/active/completed)
const taskData = [
  { date: "Mon", pending: 4, active: 3, completed: 2 },
  { date: "Tue", pending: 6, active: 4, completed: 5 },
  { date: "Wed", pending: 3, active: 2, completed: 4 },
  { date: "Thu", pending: 8, active: 5, completed: 6 },
  { date: "Fri", pending: 5, active: 6, completed: 7 },
  { date: "Sat", pending: 2, active: 1, completed: 3 },
  { date: "Sun", pending: 4, active: 2, completed: 2 },
]

const taskChartConfig = {
  pending: { label: "Pending", color: "var(--chart-1)" },
  active: { label: "Active", color: "var(--chart-4)" },
  completed: { label: "Completed", color: "var(--chart-5)" },
} satisfies ChartConfig

const chartConfig = {
  gpt4o: { label: "GPT-4o", color: "var(--chart-1)" },
  claude37: { label: "Claude 3.7 Sonnet", color: "var(--chart-2)" },
  deepseek: { label: "DeepSeek V3", color: "var(--chart-3)" },
} satisfies ChartConfig

function formatTokens(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)

  const modelTotals = modelMeta.map((m) => ({
    ...m,
    total: tokenData.reduce((sum, d) => sum + (d[m.key] as number), 0),
  }))
  const totalTokens = modelTotals.reduce((sum, m) => sum + m.total, 0)

  return (
    <div className="flex flex-col gap-6">
      {/* Greeting */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Hello, {user?.name?.split(" ")[0] ?? "there"} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening in your workspace today.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <NavLink key={stat.label} to={stat.url} className="group">
            <Card className="transition-all group-hover:ring-foreground/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardDescription>{stat.label}</CardDescription>
                  <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <HugeiconsIcon icon={stat.icon} strokeWidth={2} className="size-4" />
                  </div>
                </div>
                <CardTitle className="text-3xl font-semibold tracking-tight tabular-nums">
                  {stat.value}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={2} className="size-3.5 text-emerald-500" />
                  {stat.change}
                </p>
              </CardContent>
            </Card>
          </NavLink>
        ))}
      </div>

      {/* Task completion chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <HugeiconsIcon icon={Task01Icon} strokeWidth={2} className="size-4" />
            </div>
            <div className="flex-1">
              <CardTitle>Task Completion</CardTitle>
              <CardDescription>Tasks completed vs created over the past 7 days</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={taskChartConfig} className="h-[220px] w-full">
            <BarChart data={taskData} margin={{ left: 12, right: 12, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
              <Bar dataKey="pending" fill="var(--chart-1)" radius={4} />
              <Bar dataKey="active" fill="var(--chart-4)" radius={4} />
              <Bar dataKey="completed" fill="var(--chart-5)" radius={4} />
            </BarChart>
          </ChartContainer>
          <div className="mt-2 flex items-center justify-center gap-6">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px]" style={{ backgroundColor: "var(--chart-1)" }} />
              <span className="text-xs text-muted-foreground">Pending</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px]" style={{ backgroundColor: "var(--chart-4)" }} />
              <span className="text-xs text-muted-foreground">Active</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px]" style={{ backgroundColor: "var(--chart-5)" }} />
              <span className="text-xs text-muted-foreground">Completed</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Token usage chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <HugeiconsIcon icon={AiBrain02Icon} strokeWidth={2} className="size-4" />
            </div>
            <div className="flex-1">
              <CardTitle>Token Usage by Model</CardTitle>
              <CardDescription>LLM token consumption over the past 7 days</CardDescription>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total this week</p>
              <p className="text-lg font-semibold tabular-nums">{formatTokens(totalTokens)}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <AreaChart data={tokenData} margin={{ left: 12, right: 12, top: 8, bottom: 0 }}>
              <defs>
                {modelMeta.map((m) => (
                  <linearGradient key={m.key} id={`fill-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`var(--color-${m.key})`} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={`var(--color-${m.key})`} stopOpacity={0.05} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    formatter={(value) => formatTokens(Number(value))}
                  />
                }
              />
              {modelMeta.map((m) => (
                <Area
                  key={m.key}
                  dataKey={m.key}
                  type="natural"
                  fill={`url(#fill-${m.key})`}
                  stroke={`var(--color-${m.key})`}
                  strokeWidth={2}
                  stackId="a"
                />
              ))}
            </AreaChart>
          </ChartContainer>

          {/* Model breakdown */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-6">
            {modelTotals.map((m) => (
              <div key={m.key} className="flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: m.color }}
                />
                <span className="text-xs text-muted-foreground">{m.label}</span>
                <span className="text-xs font-medium tabular-nums">
                  {formatTokens(m.total)}
                </span>
                <span className="text-xs text-muted-foreground/60">
                  ({Math.round((m.total / totalTokens) * 100)}%)
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tip */}
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} className="size-4" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">
              Tip: Press ⌘B to toggle the sidebar
            </p>
            <p className="text-xs text-muted-foreground">
              You can also press <kbd className="text-foreground">d</kbd> to
              switch between light and dark themes.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
