import { Calendar as CalendarPrimitive } from "@/components/ui/calendar"
import type { CalendarItem } from "@/lib/calendar-types"
import { EVENT_COLORS } from "@/lib/calendar-types"
import { cn } from "@/lib/utils"
import { format } from "date-fns"

type MiniCalendarProps = {
  selectedDate: Date
  displayedMonth: Date
  onSelectDate: (date: Date) => void
  onMonthChange: (date: Date) => void
  events: CalendarItem[]
}

export function MiniCalendar({
  selectedDate,
  displayedMonth,
  onSelectDate,
  onMonthChange,
  events,
}: MiniCalendarProps) {
  const eventsByDate = new Map<
    string,
    { hex: string; count: number; isTask: boolean }
  >()
  for (const e of events) {
    const existing = eventsByDate.get(e.date)
    if (existing) {
      existing.count++
    } else {
      eventsByDate.set(e.date, {
        hex: EVENT_COLORS[e.color].hex,
        count: 1,
        isTask: e.type === "task",
      })
    }
  }

  return (
    <CalendarPrimitive
      mode="single"
      selected={selectedDate}
      month={displayedMonth}
      onMonthChange={onMonthChange}
      onSelect={(date) => {
        if (date) onSelectDate(date)
      }}
      className="w-full"
      components={{
        DayButton: ({ day, modifiers, ...props }) => {
          const dateStr = format(day.date, "yyyy-MM-dd")
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
                  style={
                    dot.isTask
                      ? {
                          backgroundColor: modifiers.selected
                            ? "currentColor"
                            : dot.hex,
                        }
                      : {
                          // Custom events render as a hollow ring to set them
                          // apart from priority-colored task dots.
                          border: `1.5px solid ${
                            modifiers.selected ? "currentColor" : dot.hex
                          }`,
                        }
                  }
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
