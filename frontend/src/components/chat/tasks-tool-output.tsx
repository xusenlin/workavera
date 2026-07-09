import { HugeiconsIcon } from "@hugeicons/react"
import {
  Calendar03Icon,
  ChevronDownIcon,
  Task01Icon,
  TextAlignLeftIcon,
} from "@hugeicons/core-free-icons"
import {
  CheckCircleIcon,
  CircleIcon,
  ClockIcon,
  XCircleIcon,
} from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { pb } from "@/lib/pocketbase"
import { PRIORITY_META } from "@/store/board"
import { ToolInput } from "@/components/chat/tool-input"
import { cn } from "@/lib/utils"
import type { DynamicToolUIPart } from "ai"
import type { ReactNode } from "react"
import { useNavigate } from "react-router"

type TaskStateSummary = {
  id: string
  name: string
  color: string
  category: string
  sortOrder: number
}

type TaskLabelSummary = {
  id: string
  name: string
  color: string
}

type TaskAssigneeSummary = {
  id: string
  name: string
  avatar?: string
  collectionId?: string
}

type TaskSummary = {
  id: string
  title: string
  description?: string
  priority?: string
  dueDate?: string
  stateId: string
  labels: TaskLabelSummary[]
  assignees: TaskAssigneeSummary[]
  rank: number
}

type TaskSearchResult = {
  states: TaskStateSummary[]
  tasks: TaskSummary[]
}

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

/** Parses the tool output, tolerating either a parsed object or a JSON string. */
function parseTaskResult(output: unknown): TaskSearchResult | null {
  const data = typeof output === "string" ? safeJsonParse(output) : output
  if (data && typeof data === "object" && "tasks" in data) {
    return data as TaskSearchResult
  }
  return null
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function isOverdue(dueDate?: string) {
  if (!dueDate) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(dueDate) < today
}

function formatDate(dueDate: string) {
  const date = new Date(dueDate)
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function assigneeAvatarUrl(assignee: TaskAssigneeSummary): string | undefined {
  if (!assignee.avatar || !assignee.collectionId) return undefined
  return pb.files.getURL(
    { id: assignee.id, collectionId: assignee.collectionId },
    assignee.avatar
  )
}

type TasksToolPart = DynamicToolUIPart

export function TasksToolCard({ part }: { part: TasksToolPart }) {
  const isError = part.state === "output-error"
  const isLoading =
    part.state === "input-streaming" || part.state === "input-available"
  const navigate = useNavigate()

  const result = parseTaskResult(part.output)
  const states = (result?.states ?? []).sort((a, b) => a.sortOrder - b.sortOrder)
  const tasks = result?.tasks ?? []

  // Group tasks by state id, sorted by rank within each group.
  const tasksByState = new Map<string, TaskSummary[]>()
  for (const task of tasks) {
    const group = tasksByState.get(task.stateId) ?? []
    group.push(task)
    tasksByState.set(task.stateId, group)
  }
  for (const group of tasksByState.values()) {
    group.sort((a, b) => a.rank - b.rank)
  }

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
            icon={Task01Icon}
            strokeWidth={2}
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="text-sm font-medium">Tasks</span>
          {part.state === "output-available" && tasks.length > 0 && (
            <Badge variant="secondary" className="rounded-full px-1.5">
              {tasks.length}
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

      <CollapsibleContent className="min-w-0 space-y-3 p-4 pt-0 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2">
        {/* Parameters */}
        <ToolInput input={part.input} />

        {isLoading && (
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ClockIcon className="size-3.5 animate-spin" />
              <span>Loading tasks...</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-primary/60" />
            </div>
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {part.errorText || "Tool execution failed"}
          </div>
        )}

        {/* Results */}
        {part.state === "output-available" && tasks.length > 0 && (
          <div className="space-y-3">
            <div className="flex max-w-full min-w-0 gap-3 overflow-x-auto pb-2">
              {states.map((state) => {
                const stateTasks = tasksByState.get(state.id) ?? []
                if (stateTasks.length === 0) return null
                return (
                  <div key={state.id} className="w-60 shrink-0 space-y-1.5">
                    {/* State header */}
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: state.color }}
                      />
                      <span className="text-sm font-semibold">{state.name}</span>
                      <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-xs tabular-nums">
                        {stateTasks.length}
                      </span>
                    </div>

                    {/* Task cards */}
                    <div className="space-y-1.5">
                      {stateTasks.map((task) => (
                        <TaskItem key={task.id} task={task} onClick={() => navigate("/board")} />
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* Tasks whose state was not returned (e.g. filtered out) */}
              {(() => {
                const stateIds = new Set(states.map((s) => s.id))
                const orphanTasks = tasks
                  .filter((t) => !stateIds.has(t.stateId))
                  .sort((a, b) => a.rank - b.rank)
                if (orphanTasks.length === 0) return null
                return (
                  <div className="w-60 shrink-0 space-y-1.5">
                    <div className="text-muted-foreground text-xs font-medium">
                      Other
                    </div>
                    <div className="space-y-1.5">
                      {orphanTasks.map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          onClick={() => navigate("/board")}
                        />
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Summary */}
            <div className="flex items-center gap-3 px-1 text-xs text-muted-foreground">
              <span>{tasks.length} tasks</span>
              {states.length > 0 && (
                <>
                  <span>·</span>
                  <span>{states.length} states</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Empty result */}
        {part.state === "output-available" && tasks.length === 0 && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            No tasks found
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

function TaskItem({ task, onClick }: { task: TaskSummary; onClick: () => void }) {
  const priorityMeta = PRIORITY_META.find((p) => p.value === task.priority)
  const overdue = isOverdue(task.dueDate)

  return (
    <div
      className="cursor-pointer rounded-lg border border-border/60 bg-card p-2.5 transition-colors hover:border-border hover:bg-muted/40"
      onClick={onClick}
    >
      {/* Labels */}
      {task.labels.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {task.labels.map((label) => (
            <span
              key={label.id}
              className="inline-flex h-4.5 items-center rounded-md px-1.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: label.color }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      {/* Title */}
      <p className="text-sm font-medium leading-snug">{task.title}</p>

      {/* Description */}
      {task.description && (
        <div className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
          <HugeiconsIcon icon={TextAlignLeftIcon} strokeWidth={2} className="size-3 shrink-0" />
          <span className="truncate">{task.description}</span>
        </div>
      )}

      {/* Footer */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {/* Priority */}
          {priorityMeta && (
            <Badge
              variant="secondary"
              className="h-4.5 gap-1 px-1.5 text-[10px]"
              style={{ color: priorityMeta.color }}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: priorityMeta.color }}
              />
              {priorityMeta.label}
            </Badge>
          )}

          {/* Due date */}
          {task.dueDate && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-[10px]",
                overdue ? "text-destructive font-medium" : "text-muted-foreground"
              )}
            >
              <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} className="size-3" />
              {formatDate(task.dueDate)}
            </span>
          )}
        </div>

        {/* Assignees */}
        {task.assignees.length > 0 && (
          <div className="flex -space-x-1.5">
            {task.assignees.slice(0, 3).map((assignee) => {
              const src = assigneeAvatarUrl(assignee)
              return (
                <Avatar key={assignee.id} size="sm" className="ring-2 ring-card">
                  {src && <AvatarImage src={src} alt={assignee.name} className="object-cover" />}
                  <AvatarFallback className="text-[9px]">
                    {assignee.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )
            })}
            {task.assignees.length > 3 && (
              <div className="bg-muted text-muted-foreground ring-2 ring-card flex size-6 items-center justify-center rounded-full text-[9px]">
                +{task.assignees.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
