import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  Location01Icon,
  Calendar03Icon,
} from "@hugeicons/core-free-icons"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { CalendarEvent } from "@/lib/calendar-types"
import { EVENT_COLORS } from "@/lib/calendar-types"
import { formatZonedTime, zonedParts } from "@/lib/timezone"
import { cn } from "@/lib/utils"

type AllEventsListProps = {
  events: CalendarEvent[]
  timezone: string
  onEditEvent: (event: CalendarEvent) => void
  onDeleteEvent: (event: CalendarEvent) => void
}

export function AllEventsList({
  events,
  timezone,
  onEditEvent,
  onDeleteEvent,
}: AllEventsListProps) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
  )

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed py-12">
        <p className="text-sm text-muted-foreground">No custom events yet</p>
        <p className="text-xs text-muted-foreground/60">
          Click &quot;New event&quot; to create one
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          All custom events
        </h2>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
          {sorted.length}
        </span>
      </div>
      <div className="max-h-[calc(100vh-12rem)] space-y-2 overflow-y-auto pr-1">
        {sorted.map((event) => (
          <EventRow
            key={event.id}
            event={event}
            timezone={timezone}
            onEdit={onEditEvent}
            onDelete={onDeleteEvent}
          />
        ))}
      </div>
    </div>
  )
}

function EventRow({
  event,
  timezone,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent
  timezone: string
  onEdit: (event: CalendarEvent) => void
  onDelete: (event: CalendarEvent) => void
}) {
  const color = EVENT_COLORS[event.color]
  const parts = zonedParts(event.startAt, timezone)
  const dateLabel = format(
    new Date(parts.year, parts.month - 1, parts.day),
    "EEE, MMM d, yyyy"
  )

  return (
    <div
      className={cn(
        "group relative flex cursor-pointer items-stretch gap-3 overflow-hidden rounded-md border bg-card transition-colors hover:border-border/80",
        color.bg
      )}
      onClick={() => onEdit(event)}
    >
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3 py-2.5 pr-3 pl-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <HugeiconsIcon
              icon={Calendar03Icon}
              strokeWidth={2}
              className={cn("size-3.5 shrink-0", color.text)}
            />
            <span className="truncate text-sm font-medium">{event.title}</span>
            {event.recurrenceFrequency !== "none" && (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                Repeats
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-medium text-muted-foreground/90">
              {dateLabel}
            </span>
            {event.allDay ? (
              <span className="text-muted-foreground/70">All day</span>
            ) : (
              <span className="tabular-nums">
                {formatZonedTime(event.startAt, timezone)} -{" "}
                {formatZonedTime(event.endAt, timezone)}
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
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80">
              {event.description}
            </p>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${event.title}`}
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
          onClick={(clickEvent) => {
            clickEvent.stopPropagation()
            onDelete(event)
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
