import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  Location01Icon,
  CheckmarkSquare02Icon,
  Calendar03Icon,
} from "@hugeicons/core-free-icons"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  type CalendarItem,
  EVENT_COLORS,
} from "@/lib/calendar-types"
import { cn } from "@/lib/utils"

type EventListProps = {
  events: CalendarItem[]
  viewMode: "day" | "week"
  selectedDate: Date
  onDeleteEvent: (id: string) => void
  onEditEvent: (event: CalendarItem) => void
}

function sortByTypeAndTime(a: CalendarItem, b: CalendarItem) {
  // Tasks (all-day) first, then events by start time
  if (a.type === "task" && b.type !== "task") return -1
  if (a.type !== "task" && b.type === "task") return 1
  return a.startTime.localeCompare(b.startTime)
}

export function EventList({
  events,
  viewMode,
  selectedDate,
  onDeleteEvent,
  onEditEvent,
}: EventListProps) {
  if (viewMode === "day") {
    const dateStr = format(selectedDate, "yyyy-MM-dd")
    const dayEvents = events
      .filter((e) => e.date === dateStr)
      .sort(sortByTypeAndTime)

    return dayEvents.length > 0 ? (
      <div className="space-y-2">
        {dayEvents.map((event) => (
          <ItemCard
            key={event.id}
            item={event}
            onDelete={onDeleteEvent}
            onEdit={onEditEvent}
          />
        ))}
      </div>
    ) : (
      <EmptyState />
    )
  }

  // Week view
  const weekStart = new Date(selectedDate)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  return (
    <div className="space-y-4">
      {days.map((day) => {
        const dateStr = format(day, "yyyy-MM-dd")
        const dayEvents = events
          .filter((e) => e.date === dateStr)
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
            {dayEvents.length > 0 ? (
              <div className="space-y-2">
                {dayEvents.map((event) => (
                  <ItemCard
                    key={event.id}
                    item={event}
                    onDelete={onDeleteEvent}
                    onEdit={onEditEvent}
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
  low: { label: "Low", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  medium: { label: "Med", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  high: { label: "High", className: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  urgent: { label: "Urgent", className: "bg-red-500/10 text-red-600 dark:text-red-400" },
}

function ItemCard({
  item,
  onDelete,
  onEdit,
}: {
  item: CalendarItem
  onDelete: (id: string) => void
  onEdit: (item: CalendarItem) => void
}) {
  const color = EVENT_COLORS[item.color]
  const isTask = item.type === "task"
  const priorityBadge = item.priority ? PRIORITY_BADGES[item.priority] : null

  return (
    <div
      className={cn(
        "group relative flex items-stretch gap-3 overflow-hidden rounded-md border bg-card transition-colors hover:border-border/80",
        color.bg
      )}
      onClick={() => onEdit(item)}
    >
      {/* Color bar */}
      <div
        className="w-1 shrink-0"
        style={{ backgroundColor: color.hex }}
      />

      {/* Content */}
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3 py-2.5 pr-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <HugeiconsIcon
              icon={isTask ? CheckmarkSquare02Icon : Calendar03Icon}
              strokeWidth={2}
              className={cn("size-3.5 shrink-0", color.text)}
            />
            <span className="truncate text-sm font-medium">{item.title}</span>
            {isTask && priorityBadge && (
              <Badge
                variant="secondary"
                className={cn("shrink-0 px-1.5 py-0 text-[10px]", priorityBadge.className)}
              >
                {priorityBadge.label}
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {!isTask && (
              <span className="tabular-nums">
                {item.startTime} - {item.endTime}
              </span>
            )}
            {isTask && (
              <span className="text-muted-foreground/70">All day</span>
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

        {/* Delete button (only for custom events) */}
        {!isTask && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(item.id)
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
        Click "New event" to create one
      </p>
    </div>
  )
}
