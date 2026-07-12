import { useCallback, useEffect, useMemo, useState } from "react"
import { format, formatDistanceToNow } from "date-fns"
import { Link } from "react-router"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  ArrowRight01Icon,
  BookOpen01Icon,
  Calendar03Icon,
  Chat01Icon,
  DocumentAttachmentIcon,
  SparklesIcon,
  Task01Icon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"
import type { RecordModel } from "pocketbase"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { pb } from "@/lib/pocketbase"
import { cn } from "@/lib/utils"
import { workspaceRecordUrl } from "@/lib/workspace-navigation"
import { useAuthStore } from "@/store/auth"

type ProjectRecord = RecordModel & { archived: boolean }

type ProjectStateRecord = RecordModel & {
  category: "pending" | "active" | "completed"
}

type ProjectNameRecord = RecordModel & { name: string }

type TaskRecord = RecordModel & {
  project: string
  title: string
  priority: "none" | "low" | "medium" | "high" | "urgent"
  due_date: string
  expand?: {
    project?: ProjectNameRecord
    state?: ProjectStateRecord
  }
}

type EventRecord = RecordModel & {
  title: string
  start_at: string
  all_day: boolean
}

type DocRecord = RecordModel & {
  title: string
  status: "draft" | "archived"
  updated: string
}

type ConversationRecord = RecordModel & {
  title: string
  status: "active" | "archived"
  updated: string
}

type ReadingRecord = RecordModel & {
  title: string
  status: "unread" | "read" | "archived"
  updated: string
}

type DashboardData = {
  loadedAt: number
  activeProjects: number
  openTasks: number
  upcomingEvents: number
  unreadItems: number
  focusTasks: TaskRecord[]
  upcomingItems: UpcomingItem[]
  recentWork: RecentWorkItem[]
}

type UpcomingItem =
  | {
      id: string
      type: "event"
      title: string
      date: string
      allDay: boolean
    }
  | {
      id: string
      type: "task"
      title: string
      date: string
      projectId: string
      projectName: string
      priority: TaskRecord["priority"]
    }

type RecentWorkItem = {
  id: string
  title: string
  type: "Document" | "Chat" | "Reading"
  url: string
  updated: string
  icon: IconSvgElement
}

const priorityMeta: Record<
  TaskRecord["priority"],
  { label: string; className: string }
> = {
  none: { label: "No priority", className: "text-muted-foreground" },
  low: { label: "Low", className: "text-muted-foreground" },
  medium: { label: "Medium", className: "text-amber-600 dark:text-amber-400" },
  high: { label: "High", className: "text-orange-600 dark:text-orange-400" },
  urgent: { label: "Urgent", className: "text-destructive" },
}

function dateFilterValue(date: Date) {
  return date.toISOString().replaceAll('"', '\\"')
}

async function loadDashboard(): Promise<DashboardData> {
  const now = new Date()
  const nextWeek = new Date(now)
  nextWeek.setDate(nextWeek.getDate() + 7)
  const nowValue = dateFilterValue(now)
  const nextWeekValue = dateFilterValue(nextWeek)
  const openTaskFilter = 'state.category != "completed"'
  const upcomingEventFilter = `start_at >= "${nowValue}" && start_at < "${nextWeekValue}"`

  const [
    projects,
    tasks,
    unread,
    focusTasks,
    nextEvents,
    upcomingTasks,
    docs,
    conversations,
    reading,
  ] = await Promise.all([
    pb.collection("board_projects").getList<ProjectRecord>(1, 1, {
      filter: "archived = false",
      fields: "id",
      requestKey: null,
    }),
    pb.collection("board_tasks").getList<TaskRecord>(1, 1, {
      filter: openTaskFilter,
      fields: "id",
      requestKey: null,
    }),
    pb.collection("reading_items").getList<ReadingRecord>(1, 1, {
      filter: 'status = "unread"',
      fields: "id",
      requestKey: null,
    }),
    pb.collection("board_tasks").getList<TaskRecord>(1, 5, {
      filter: `${openTaskFilter} && due_date != ""`,
      sort: "due_date",
      expand: "project,state",
      fields: "id,project,title,priority,due_date,expand",
      requestKey: null,
    }),
    pb.collection("calendar_events").getList<EventRecord>(1, 4, {
      filter: upcomingEventFilter,
      sort: "start_at",
      fields: "id,title,start_at,all_day",
      requestKey: null,
    }),
    pb.collection("board_tasks").getList<TaskRecord>(1, 4, {
      filter: `${openTaskFilter} && due_date >= "${nowValue}" && due_date < "${nextWeekValue}"`,
      sort: "due_date",
      expand: "project,state",
      fields: "id,project,title,priority,due_date,expand",
      requestKey: null,
    }),
    pb.collection("docs").getList<DocRecord>(1, 3, {
      filter: 'status = "draft"',
      sort: "-updated",
      fields: "id,title,status,updated",
      requestKey: null,
    }),
    pb.collection("chat_conversations").getList<ConversationRecord>(1, 3, {
      filter: 'status = "active"',
      sort: "-updated",
      fields: "id,title,status,updated",
      requestKey: null,
    }),
    pb.collection("reading_items").getList<ReadingRecord>(1, 3, {
      filter: 'status != "archived"',
      sort: "-updated",
      fields: "id,title,status,updated",
      requestKey: null,
    }),
  ])

  const recentWork = [
    ...docs.items.map<RecentWorkItem>((item) => ({
      id: item.id,
      title: item.title,
      type: "Document",
      url: workspaceRecordUrl("docs", item.id),
      updated: item.updated,
      icon: DocumentAttachmentIcon,
    })),
    ...conversations.items.map<RecentWorkItem>((item) => ({
      id: item.id,
      title: item.title,
      type: "Chat",
      url: workspaceRecordUrl("chat", item.id),
      updated: item.updated,
      icon: Chat01Icon,
    })),
    ...reading.items.map<RecentWorkItem>((item) => ({
      id: item.id,
      title: item.title,
      type: "Reading",
      url: workspaceRecordUrl("reading", item.id),
      updated: item.updated,
      icon: BookOpen01Icon,
    })),
  ]
    .sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated))
    .slice(0, 6)

  const upcomingItems: UpcomingItem[] = [
    ...nextEvents.items.map<UpcomingItem>((event) => ({
      id: event.id,
      type: "event",
      title: event.title,
      date: event.start_at,
      allDay: event.all_day,
    })),
    ...upcomingTasks.items.map<UpcomingItem>((task) => ({
      id: task.id,
      type: "task",
      title: task.title,
      date: task.due_date,
      projectId: task.project,
      projectName: task.expand?.project?.name || "Board",
      priority: task.priority,
    })),
  ]
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .slice(0, 4)

  return {
    loadedAt: now.getTime(),
    activeProjects: projects.totalItems,
    openTasks: tasks.totalItems,
    upcomingEvents: nextEvents.totalItems + upcomingTasks.totalItems,
    unreadItems: unread.totalItems,
    focusTasks: focusTasks.items,
    upcomingItems,
    recentWork,
  }
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-36 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  )
}

export function DashboardPage() {
  const user = useAuthStore((state) => state.user)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await loadDashboard())
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load your workspace overview."
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    void loadDashboard()
      .then((result) => {
        if (active) setData(result)
      })
      .catch((cause: unknown) => {
        if (!active) return
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load your workspace overview."
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const stats = useMemo(
    () => [
      {
        label: "Active projects",
        value: data?.activeProjects ?? 0,
        detail: "Shared and owned",
        icon: Task01Icon,
        url: "/board",
      },
      {
        label: "Open tasks",
        value: data?.openTasks ?? 0,
        detail: "Across your projects",
        icon: Task01Icon,
        url: "/board",
      },
      {
        label: "Next 7 days",
        value: data?.upcomingEvents ?? 0,
        detail: "Events and task deadlines",
        icon: Calendar03Icon,
        url: "/calendar",
      },
      {
        label: "Reading queue",
        value: data?.unreadItems ?? 0,
        detail: "Unread sources",
        icon: BookOpen01Icon,
        url: "/reading",
      },
    ],
    [data]
  )

  if (loading && !data) return <DashboardSkeleton />

  if (error && !data) {
    return (
      <Card className="mx-auto mt-20 max-w-lg text-center">
        <CardHeader>
          <CardTitle>Could not load the dashboard</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => void refresh()}>Try again</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Hello, {user?.name?.split(" ")[0] || "there"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Here is what needs your attention across the workspace.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/chat">
            <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} className="size-4" />
            Ask Workavera
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} to={stat.url} className="group">
            <Card className="h-full transition-shadow group-hover:ring-foreground/20">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <CardDescription>{stat.label}</CardDescription>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <HugeiconsIcon icon={stat.icon} strokeWidth={2} className="size-4" />
                  </div>
                </div>
                <CardTitle className="text-3xl font-semibold tracking-tight tabular-nums">
                  {stat.value}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {stat.detail}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>Open tasks with the nearest due dates.</CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link to="/board">
                  View board
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4" />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {data?.focusTasks.length ? (
              <div className="divide-y divide-border/70">
                {data.focusTasks.map((task) => {
                  const dueDate = new Date(task.due_date)
                  const overdue = dueDate.getTime() < data.loadedAt
                  const priority = priorityMeta[task.priority]
                  return (
                    <Link
                      key={task.id}
                      to={workspaceRecordUrl("board", task.id)}
                      className="flex items-center gap-3 py-3.5 transition-colors first:pt-0 last:pb-0 hover:text-primary"
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                        <HugeiconsIcon icon={Task01Icon} strokeWidth={2} className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{task.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {task.expand?.project?.name || "Board"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={cn(
                            "text-xs tabular-nums",
                            overdue ? "font-medium text-destructive" : "text-muted-foreground"
                          )}
                        >
                          {overdue ? "Overdue · " : ""}
                          {format(dueDate, "MMM d")}
                        </span>
                        {task.priority !== "none" && (
                          <span className={cn("text-[11px]", priority.className)}>
                            {priority.label}
                          </span>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            ) : (
              <div className="flex min-h-48 flex-col items-center justify-center text-center">
                <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <HugeiconsIcon icon={Task01Icon} strokeWidth={2} className="size-5" />
                </div>
                <p className="text-sm font-medium">Nothing due soon</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  Tasks with due dates will appear here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Coming up</CardTitle>
            <CardDescription>Your next seven days.</CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="icon-sm">
                <Link to="/calendar" aria-label="Open calendar">
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4" />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {data?.upcomingItems.length ? (
              <div className="space-y-4">
                {data.upcomingItems.map((item) => {
                  const start = new Date(item.date)
                  const isEvent = item.type === "event"
                  return (
                    <Link
                      key={`${item.type}-${item.id}`}
                      to={workspaceRecordUrl(
                        isEvent ? "calendar" : "board",
                        item.id
                      )}
                      className="flex gap-3 rounded-xl transition-colors hover:text-primary"
                    >
                      <div className="flex w-10 shrink-0 flex-col items-center rounded-lg bg-muted py-1.5 text-center">
                        <span className="text-[10px] font-medium uppercase text-muted-foreground">
                          {format(start, "MMM")}
                        </span>
                        <span className="text-base font-semibold leading-4 tabular-nums">
                          {format(start, "d")}
                        </span>
                      </div>
                      <div className="min-w-0 pt-0.5">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {isEvent
                            ? item.allDay
                              ? "Event · All day"
                              : `Event · ${format(start, "EEE, h:mm a")}`
                            : `Task · ${item.projectName}`}
                        </p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            ) : (
              <div className="flex min-h-48 flex-col items-center justify-center text-center">
                <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} className="size-5" />
                </div>
                <p className="text-sm font-medium">Your week is open</p>
                <Button asChild variant="link" size="sm" className="mt-1 h-auto px-0">
                  <Link to="/calendar">Plan an event</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>Continue working</CardTitle>
            <CardDescription>Recently updated knowledge and conversations.</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.recentWork.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {data.recentWork.map((item) => (
                  <Link
                    key={`${item.type}-${item.id}`}
                    to={item.url}
                    className="flex items-center gap-3 rounded-xl p-3 ring-1 ring-foreground/10 transition-colors hover:bg-muted/60"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <HugeiconsIcon icon={item.icon} strokeWidth={2} className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.type} · {formatDistanceToNow(new Date(item.updated), { addSuffix: true })}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Your recent work will appear here.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick start</CardTitle>
            <CardDescription>Jump into a common workflow.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {[
              { label: "Start an AI chat", url: "/chat", icon: SparklesIcon },
              { label: "Open the board", url: "/board", icon: Task01Icon },
              { label: "Create a document", url: "/docs", icon: DocumentAttachmentIcon },
              { label: "Save something to read", url: "/reading", icon: Add01Icon },
            ].map((action) => (
              <Button
                key={action.label}
                asChild
                variant="outline"
                className="h-10 justify-start"
              >
                <Link to={action.url}>
                  <HugeiconsIcon icon={action.icon} strokeWidth={2} className="size-4" />
                  {action.label}
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      {error && (
        <Badge variant="destructive" className="self-start">
          Some dashboard data may be out of date.
        </Badge>
      )}
    </div>
  )
}
