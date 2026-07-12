import { Calendar as CalendarPrimitive } from "@/components/ui/calendar"
import type { CalendarItem } from "@/lib/calendar-types"
import { EVENT_COLORS } from "@/lib/calendar-types"
import { cn } from "@/lib/utils"

type MiniCalendarProps = {
  selectedDate: Date
  onSelectDate: (date: Date) => void
  events: CalendarItem[]
}

export function MiniCalendar({
  selectedDate,
  onSelectDate,
  events,
}: MiniCalendarProps) {
  const eventsByDate = new Map<
    string,
    { hex: string; count: number }
  >()
  for (const e of events) {
    const existing = eventsByDate.get(e.date)
    if (existing) {
      existing.count++
    } else {
      eventsByDate.set(e.date, {
        hex: EVENT_COLORS[e.color].hex,
        count: 1,
      })
    }
  }

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
          const dot = eventsByDate.get(dateStr)
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
              {dot && (
                <span
                  className="absolute bottom-1 size-1.5 rounded-full"
                  style={{
                    backgroundColor: modifiers.selected
                      ? "currentColor"
                      : dot.hex,
                  }}
                />
              )}
            </button>
          )
        },
      }}
    />
  )
}

export { EVENT_COLORS }
