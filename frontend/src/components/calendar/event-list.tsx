import { HugeiconsIcon } from "@hugeicons/react"
import { Delete02Icon, Location01Icon } from "@hugeicons/core-free-icons"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import {
  type CalendarEvent,
  EVENT_COLORS,
} from "@/lib/calendar-types"
import { cn } from "@/lib/utils"

type EventListProps = {
  events: CalendarEvent[]
  viewMode: "day" | "week"
  selectedDate: Date
  onDeleteEvent: (id: string) => void
  onEditEvent: (event: CalendarEvent) => void
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
      .sort((a, b) => a.startTime.localeCompare(b.startTime))

    return (
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {format(selectedDate, "EEEE, MMM d")}
        </h2>
        {dayEvents.length > 0 ? (
          <div className="space-y-2">
            {dayEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onDelete={onDeleteEvent}
                onEdit={onEditEvent}
              />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
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
    <div className="space-y-5">
      {days.map((day) => {
        const dateStr = format(day, "yyyy-MM-dd")
        const dayEvents = events
          .filter((e) => e.date === dateStr)
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
        const isToday = format(new Date(), "yyyy-MM-dd") === dateStr
        const isSelected = format(selectedDate, "yyyy-MM-dd") === dateStr

        return (
          <div key={dateStr} className="space-y-2">
            <div className="flex items-center gap-2">
              <h2
                className={cn(
                  "text-sm font-medium",
                  isSelected ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {format(day, "EEEE, MMM d")}
              </h2>
              {isToday && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                  Today
                </span>
              )}
            </div>
            {dayEvents.length > 0 ? (
              <div className="space-y-2">
                {dayEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onDelete={onDeleteEvent}
                    onEdit={onEditEvent}
                  />
                ))}
              </div>
            ) : (
              <p className="py-1 text-xs text-muted-foreground/60">
                No events
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function EventCard({
  event,
  onDelete,
  onEdit,
}: {
  event: CalendarEvent
  onDelete: (id: string) => void
  onEdit: (event: CalendarEvent) => void
}) {
  const color = EVENT_COLORS[event.color]

  return (
    <div
      className={cn(
        "group relative flex items-stretch gap-3 overflow-hidden rounded-md border bg-card transition-colors hover:border-border/80",
        color.bg
      )}
      onClick={() => onEdit(event)}
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
            <span className="text-sm font-medium">{event.title}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {event.startTime} - {event.endTime}
            </span>
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

        {/* Delete button */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(event.id)
          }}
        >
          <HugeiconsIcon
            icon={Delete02Icon}
            strokeWidth={2}
            className="size-3.5 text-muted-foreground"
          />
        </Button>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed py-12">
      <p className="text-sm text-muted-foreground">No events on this day</p>
      <p className="text-xs text-muted-foreground/60">
        Click "New event" to create one
      </p>
    </div>
  )
}
