import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  Location01Icon,
  CheckmarkSquare02Icon,
  Calendar03Icon,
} from "@hugeicons/core-free-icons"
import { format, startOfWeek } from "date-fns"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { CalendarEvent, CalendarItem } from "@/lib/calendar-types"
import { EVENT_COLORS } from "@/lib/calendar-types"
import { cn } from "@/lib/utils"

type EventListProps = {
  items: CalendarItem[]
  viewMode: "day" | "week"
  selectedDate: Date
  onDeleteEvent: (event: CalendarEvent) => void
  onEditEvent: (event: CalendarEvent) => void
  onOpenTask: (taskId: string, projectId: string) => void
}

function sortByTypeAndTime(a: CalendarItem, b: CalendarItem) {
  if (a.allDay && !b.allDay) return -1
  if (!a.allDay && b.allDay) return 1
  return a.startTime.localeCompare(b.startTime)
}

export function EventList({
  items,
  viewMode,
  selectedDate,
  onDeleteEvent,
  onEditEvent,
  onOpenTask,
}: EventListProps) {
  if (viewMode === "day") {
    const dateStr = format(selectedDate, "yyyy-MM-dd")
    const dayItems = items
      .filter((item) => item.date === dateStr)
      .sort(sortByTypeAndTime)

    return dayItems.length > 0 ? (
      <div className="space-y-2">
        {dayItems.map((item) => (
          <ItemCard
            key={item.key}
            item={item}
            onDelete={onDeleteEvent}
            onEdit={onEditEvent}
            onOpenTask={onOpenTask}
          />
        ))}
      </div>
    ) : (
      <EmptyState />
    )
  }

  const weekStart = startOfWeek(selectedDate)
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart)
    day.setDate(day.getDate() + index)
    return day
  })

  return (
    <div className="space-y-4">
      {days.map((day) => {
        const dateStr = format(day, "yyyy-MM-dd")
        const dayItems = items
          .filter((item) => item.date === dateStr)
          .sort(sortByTypeAndTime)
        const isToday = format(new Date(), "yyyy-MM-dd") === dateStr

        return (
          <div key={dateStr} className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-sm font-medium",
                  isToday ? "text-primary" : "text-muted-foreground"
                )}
              >
                {format(day, "EEE, MMM d")}
              </span>
              {isToday && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                  Today
                </span>
              )}
            </div>
            {dayItems.length > 0 ? (
              <div className="space-y-2">
                {dayItems.map((item) => (
                  <ItemCard
                    key={item.key}
                    item={item}
                    onDelete={onDeleteEvent}
                    onEdit={onEditEvent}
                    onOpenTask={onOpenTask}
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
  )
}

const PRIORITY_BADGES: Record<
  string,
  { label: string; className: string }
> = {
  none: { label: "None", className: "bg-muted text-muted-foreground" },
  low: {
    label: "Low",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  medium: {
    label: "Med",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  high: {
    label: "High",
    className: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  urgent: {
    label: "Urgent",
    className: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
}

function ItemCard({
  item,
  onDelete,
  onEdit,
  onOpenTask,
}: {
  item: CalendarItem
  onDelete: (event: CalendarEvent) => void
  onEdit: (event: CalendarEvent) => void
  onOpenTask: (taskId: string, projectId: string) => void
}) {
  const color = EVENT_COLORS[item.color]
  const isTask = item.type === "task"
  const priorityBadge =
    item.type === "task" ? PRIORITY_BADGES[item.priority] : null

  return (
    <div
      className={cn(
        "group relative flex cursor-pointer items-stretch gap-3 overflow-hidden rounded-md border bg-card transition-colors hover:border-border/80",
        color.bg
      )}
      onClick={() =>
        item.type === "event"
          ? onEdit(item.event)
          : onOpenTask(item.id, item.projectId)
      }
    >
      {isTask && (
        <div className="w-1 shrink-0" style={{ backgroundColor: color.hex }} />
      )}

      <div
        className={cn(
          "flex min-w-0 flex-1 items-center justify-between gap-3 py-2.5 pr-3",
          !isTask && "pl-3"
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <HugeiconsIcon
              icon={isTask ? CheckmarkSquare02Icon : Calendar03Icon}
              strokeWidth={2}
              className={cn("size-3.5 shrink-0", color.text)}
            />
            <span
              className={cn(
                "truncate text-sm font-medium",
                item.type === "task" && item.completed &&
                  "text-muted-foreground line-through"
              )}
            >
              {item.title}
            </span>
            {priorityBadge && (
              <Badge
                variant="secondary"
                className={cn(
                  "shrink-0 px-1.5 py-0 text-[10px]",
                  priorityBadge.className
                )}
              >
                {priorityBadge.label}
              </Badge>
            )}
            {item.type === "event" &&
              item.event.recurrenceFrequency !== "none" && (
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  Repeats
                </Badge>
              )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {item.allDay ? (
              <span className="text-muted-foreground/70">All day</span>
            ) : (
              <span className="tabular-nums">
                {item.startTime} - {item.endTime}
              </span>
            )}
            {item.location && (
              <span className="flex items-center gap-0.5">
                <HugeiconsIcon
                  icon={Location01Icon}
                  strokeWidth={2}
                  className="size-3"
                />
                {item.location}
              </span>
            )}
          </div>
          {item.description && (
            <p className="mt-1 truncate text-xs text-muted-foreground/80">
              {item.description}
            </p>
          )}
        </div>

        {item.type === "event" && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${item.title}`}
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
            onClick={(clickEvent) => {
              clickEvent.stopPropagation()
              onDelete(item.event)
            }}
          >
            <HugeiconsIcon
              icon={Delete02Icon}
              strokeWidth={2}
              className="size-3.5 text-muted-foreground"
            />
          </Button>
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed py-12">
      <p className="text-sm text-muted-foreground">No items on this day</p>
      <p className="text-xs text-muted-foreground/60">
        Click &quot;New event&quot; to create one
      </p>
    </div>
  )
}
