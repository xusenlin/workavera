import { HugeiconsIcon } from "@hugeicons/react"
import {
  ChevronDownIcon,
  Calendar03Icon,
  PlusSignIcon,
  Edit01Icon,
  Location01Icon,
  CheckmarkSquare02Icon,
} from "@hugeicons/core-free-icons"
import {
  CheckCircleIcon,
  CircleIcon,
  ClockIcon,
  XCircleIcon,
} from "lucide-react"
import type { DynamicToolUIPart } from "ai"
import type { ReactNode } from "react"
import { useNavigate } from "react-router"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ToolInput } from "@/components/chat/tool-input"
import { cn } from "@/lib/utils"
import { workspaceRecordUrl } from "@/lib/workspace-navigation"

// ── Types ────────────────────────────────────────────────────

type ScheduleTask = {
  id: string
  title: string
  description?: string
  priority: string
  dueDate: string
  projectId: string
  projectName: string
  stateId: string
  stateName: string
  completed: bool
}

type CalendarEvent = {
  id: string
  title: string
  description?: string
  startAt: string
  endAt: string
  allDay: boolean
  timezone: string
  location?: string
  color: string
  recurrenceFrequency: string
  recurrenceInterval: number
  reminderMinutesBefore: number
  occurrenceDate?: string
  instanceStart?: string
  instanceEnd?: string
}

type ScheduleDay = {
  date: string
  tasks: ScheduleTask[]
  events: CalendarEvent[]
}

type ScheduleResult = {
  days: ScheduleDay[]
}

type EventMutationResult = {
  ok?: boolean
  action?: string
  event?: CalendarEvent
}

const EVENT_COLORS: Record<string, { hex: string; bg: string }> = {
  blue: { hex: "#3b82f6", bg: "bg-blue-500/10" },
  green: { hex: "#22c55e", bg: "bg-green-500/10" },
  amber: { hex: "#f59e0b", bg: "bg-amber-500/10" },
  red: { hex: "#ef4444", bg: "bg-red-500/10" },
  purple: { hex: "#8b5cf6", bg: "bg-purple-500/10" },
}

const PRIORITY_BADGES: Record<string, { label: string; className: string }> = {
  none: { label: "None", className: "bg-muted text-muted-foreground" },
  low: { label: "Low", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  medium: { label: "Med", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  high: { label: "High", className: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  urgent: { label: "Urgent", className: "bg-red-500/10 text-red-600 dark:text-red-400" },
}

// ── Shared helpers ───────────────────────────────────────────

const statusLabels: Partial<Record<DynamicToolUIPart["state"], string>> = {
  "input-available": "Running",
  "input-streaming": "Pending",
  "output-available": "Completed",
  "output-error": "Error",
}

const statusIcons: Partial<Record<DynamicToolUIPart["state"], ReactNode>> = {
  "input-available": <ClockIcon className="size-4 animate-pulse" />,
  "input-streaming": <CircleIcon className="size-4" />,
  "output-available": <CheckCircleIcon className="size-4 text-green-600" />,
  "output-error": <XCircleIcon className="size-4 text-red-600" />,
}

function getStatusBadge(state: DynamicToolUIPart["state"]) {
  const icon = statusIcons[state]
  const label = statusLabels[state]
  if (!icon || !label) return null
  return (
    <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
      {icon}
      {label}
    </Badge>
  )
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00")
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
  } catch {
    return dateStr
  }
}

function formatTime(isoStr: string): string {
  try {
    const d = new Date(isoStr)
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return isoStr
  }
}

function parseOutput<T>(output: unknown): T | null {
  if (typeof output === "object" && output !== null && !Array.isArray(output)) {
    return output as T
  }
  if (typeof output === "string") {
    try {
      const parsed = JSON.parse(output)
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as T
      }
    } catch {
      return null
    }
  }
  return null
}

// ── Schedule card ────────────────────────────────────────────

export function CalendarScheduleToolCard({
  part,
}: {
  part: DynamicToolUIPart
}) {
  const isError = part.state === "output-error"
  const isLoading =
    part.state === "input-streaming" || part.state === "input-available"
  const navigate = useNavigate()
  const result = parseOutput<ScheduleResult>(part.output)
  const days = result?.days ?? []
  const totalItems = days.reduce(
    (sum, d) => sum + d.tasks.length + d.events.length,
    0
  )

  return (
    <Collapsible
      defaultOpen={true}
      className="group not-prose mb-4 w-full rounded-md border"
    >
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between gap-4 p-3",
          isLoading && "cursor-default"
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <HugeiconsIcon
            icon={Calendar03Icon}
            strokeWidth={2}
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="text-sm font-medium">Schedule</span>
          {totalItems > 0 && (
            <Badge variant="secondary" className="rounded-full px-1.5">
              {totalItems}
            </Badge>
          )}
          {getStatusBadge(part.state)}
        </div>
        <HugeiconsIcon
          icon={ChevronDownIcon}
          strokeWidth={2}
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-3 p-4 pt-0 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2">
        <ToolInput input={part.input} />

        {isLoading && (
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ClockIcon className="size-3.5 animate-spin" />
              <span>Loading schedule…</span>
            </div>
          </div>
        )}

        {isError && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {part.errorText || "Tool execution failed"}
          </div>
        )}

        {part.state === "output-available" && days.length > 0 && (
          <div className="space-y-4">
            {days.map((day) => {
              const isToday =
                new Date().toISOString().slice(0, 10) === day.date
              const hasItems = day.tasks.length > 0 || day.events.length > 0

              return (
                <div key={day.date} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        isToday ? "text-primary" : "text-muted-foreground"
                      )}
                    >
                      {formatDate(day.date)}
                    </span>
                    {isToday && (
                      <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                        Today
                      </span>
                    )}
                  </div>

                  {hasItems ? (
                    <div className="space-y-2">
                      {/* Events */}
                      {day.events.map((event) => (
                        <EventRow
                          key={event.id}
                          event={event}
                        />
                      ))}
                      {/* Tasks */}
                      {day.tasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          onClick={() =>
                            navigate(workspaceRecordUrl("board", task.id))
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="py-0.5 pl-1 text-xs text-muted-foreground/50">
                      No items
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {part.state === "output-available" && days.length === 0 && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            No schedule found
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

function EventRow({ event }: { event: CalendarEvent }) {
  const color = EVENT_COLORS[event.color] ?? EVENT_COLORS.blue
  const start = event.instanceStart ?? event.startAt
  const end = event.instanceEnd ?? event.endAt

  return (
    <div
      className={cn(
        "group relative flex items-stretch gap-3 overflow-hidden rounded-md border bg-card transition-colors hover:border-border/80",
        color.bg
      )}
    >
      <div
        className="w-1 shrink-0"
        style={{ backgroundColor: color.hex }}
      />
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3 py-2.5 pr-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <HugeiconsIcon
              icon={Calendar03Icon}
              strokeWidth={2}
              className={cn("size-3.5 shrink-0")}
              style={{ color: color.hex }}
            />
            <span className="truncate text-sm font-medium">{event.title}</span>
            {event.recurrenceFrequency && event.recurrenceFrequency !== "none" && (
              <Badge variant="secondary" className="shrink-0 px-1 text-[10px] capitalize">
                {event.recurrenceFrequency}
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {event.allDay ? (
              <span>All day</span>
            ) : (
              <span className="tabular-nums">
                {formatTime(start)} - {formatTime(end)}
              </span>
            )}
            {event.location && (
              <span className="flex items-center gap-0.5">
                <HugeiconsIcon
                  icon={Location01Icon}
                  strokeWidth={2}
                  className="size-3"
                />
                {event.location}
              </span>
            )}
          </div>
          {event.description && (
            <p className="mt-1 truncate text-xs text-muted-foreground/80">
              {event.description}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function TaskRow({
  task,
  onClick,
}: {
  task: ScheduleTask
  onClick: () => void
}) {
  const priorityBadge = PRIORITY_BADGES[task.priority]

  return (
    <div
      className="group relative flex items-stretch gap-3 overflow-hidden rounded-md border bg-card transition-colors hover:border-border/80 hover:bg-muted/50"
      onClick={onClick}
    >
      <div className="w-1 shrink-0 bg-muted-foreground/40" />
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3 py-2.5 pr-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <HugeiconsIcon
              icon={CheckmarkSquare02Icon}
              strokeWidth={2}
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <span
              className={cn(
                "truncate text-sm font-medium",
                task.completed && "text-muted-foreground line-through"
              )}
            >
              {task.title}
            </span>
            {priorityBadge && task.priority !== "none" && (
              <Badge
                variant="secondary"
                className={cn("shrink-0 px-1 text-[10px]", priorityBadge.className)}
              >
                {priorityBadge.label}
              </Badge>
            )}
            {task.completed && (
              <Badge variant="secondary" className="shrink-0 px-1 text-[10px]">
                Done
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="tabular-nums">Due {task.dueDate}</span>
            {task.projectName && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                {task.projectName}
              </span>
            )}
            {task.stateName && (
              <span>{task.stateName}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Mutation card (create / update) ──────────────────────────

const mutationToolMeta: Record<
  string,
  { label: string; icon: typeof PlusSignIcon }
> = {
  calendar_create_event: { label: "Create Event", icon: PlusSignIcon },
  calendar_update_event: { label: "Update Event", icon: Edit01Icon },
}

export function CalendarMutationToolCard({
  part,
}: {
  part: DynamicToolUIPart
}) {
  const navigate = useNavigate()
  const isError = part.state === "output-error"
  const isLoading =
    part.state === "input-streaming" || part.state === "input-available"
  const meta = mutationToolMeta[part.toolName] ?? {
    label: "Calendar Event",
    icon: Calendar03Icon,
  }
  const isCreate = part.toolName === "calendar_create_event"
  const result = parseOutput<EventMutationResult>(part.output)
  const event = result?.event

  return (
    <Collapsible
      defaultOpen={true}
      className="group not-prose mb-4 w-full rounded-md border"
    >
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between gap-4 p-3",
          isLoading && "cursor-default"
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <HugeiconsIcon
            icon={meta.icon}
            strokeWidth={2}
            className={cn(
              "size-4 shrink-0",
              isCreate ? "text-green-600" : "text-muted-foreground"
            )}
          />
          <span className="text-sm font-medium">{meta.label}</span>
          {getStatusBadge(part.state)}
        </div>
        <HugeiconsIcon
          icon={ChevronDownIcon}
          strokeWidth={2}
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-3 p-4 pt-0 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2">
        <ToolInput input={part.input} />

        {isLoading && (
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ClockIcon className="size-3.5 animate-spin" />
              <span>
                {isCreate ? "Creating event…" : "Updating event…"}
              </span>
            </div>
          </div>
        )}

        {isError && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {part.errorText || "Tool execution failed"}
          </div>
        )}

        {part.state === "output-available" && event && (
          <div className="space-y-3 rounded-md border bg-card px-3 py-2">
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <HugeiconsIcon
                    icon={Calendar03Icon}
                    strokeWidth={2}
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span className="truncate text-sm font-medium">
                    {event.title}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {result?.action && (
                    <Badge
                      className="bg-green-500/10 text-[10px] text-green-700 dark:text-green-400"
                    >
                      {result.action === "created" ? "Created" : "Saved"}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {event.allDay ? (
                  <span>All day</span>
                ) : (
                  <span className="tabular-nums">
                    {formatTime(event.startAt)} - {formatTime(event.endAt)}
                  </span>
                )}
                <span>{event.timezone}</span>
                {event.location && (
                  <span className="flex items-center gap-0.5">
                    <HugeiconsIcon
                      icon={Location01Icon}
                      strokeWidth={2}
                      className="size-3"
                    />
                    {event.location}
                  </span>
                )}
              </div>
              {event.description && (
                <p className="mt-1 text-xs text-muted-foreground/80">
                  {event.description}
                </p>
              )}
              {event.recurrenceFrequency && event.recurrenceFrequency !== "none" && (
                <p className="mt-0.5 text-xs text-muted-foreground/70 capitalize">
                  Repeats {event.recurrenceFrequency}
                  {event.recurrenceInterval > 1
                    ? ` (every ${event.recurrenceInterval})`
                    : ""}
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0"
                onClick={() =>
                  navigate(workspaceRecordUrl("calendar", event.id))
                }
              >
                Open Calendar
              </Button>
            </div>
          </div>
        )}

        {part.state === "output-available" && !event && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Event not found
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
