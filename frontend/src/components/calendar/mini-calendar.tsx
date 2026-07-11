import { Calendar as CalendarPrimitive } from "@/components/ui/calendar"
import type { CalendarEvent } from "@/lib/calendar-types"
import { EVENT_COLORS } from "@/lib/calendar-types"
import { cn } from "@/lib/utils"

type MiniCalendarProps = {
  selectedDate: Date
  onSelectDate: (date: Date) => void
  events: CalendarEvent[]
}

export function MiniCalendar({
  selectedDate,
  onSelectDate,
  events,
}: MiniCalendarProps) {
  const eventDateSet = new Set(events.map((e) => e.date))

  return (
    <CalendarPrimitive
      mode="single"
      selected={selectedDate}
      onSelect={(date) => {
        if (date) onSelectDate(date)
      }}
      className="w-full"
      components={{
        DayButton: ({ day, modifiers, ...props }) => {
          const dateStr = day.date.toISOString().slice(0, 10)
          const hasEvents = eventDateSet.has(dateStr)
          return (
            <button
              {...props}
              className={cn(
                "relative isolate z-10 flex aspect-square size-auto w-full min-w-(--cell-size) flex-col items-center justify-center gap-0.5 rounded-(--cell-radius) border-0 leading-none font-normal transition-colors hover:bg-muted",
                modifiers.selected &&
                  "bg-primary text-primary-foreground hover:bg-primary",
                !modifiers.selected &&
                  modifiers.today &&
                  "bg-muted text-foreground",
                modifiers.outside && "text-muted-foreground"
              )}
            >
              <span>{day.date.getDate()}</span>
              {hasEvents && (
                <span
                  className={cn(
                    "absolute bottom-1 flex gap-0.5",
                    modifiers.selected && "opacity-80"
                  )}
                >
                  <span className="size-1 rounded-full bg-current" />
                </span>
              )}
            </button>
          )
        },
      }}
    />
  )
}

export { EVENT_COLORS }
