import { useState } from "react"
import { format } from "date-fns"

import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Calendar03Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { MiniCalendar } from "@/components/calendar/mini-calendar"
import { EventList } from "@/components/calendar/event-list"
import { EventDialog } from "@/components/calendar/event-dialog"
import {
  type CalendarEvent,
  MOCK_EVENTS,
} from "@/lib/calendar-types"
import { cn } from "@/lib/utils"

export function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<"day" | "week">("day")
  const [events, setEvents] = useState<CalendarEvent[]>(MOCK_EVENTS)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)

  const handleNewEvent = () => {
    setEditingEvent(null)
    setDialogOpen(true)
  }

  const handleEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event)
    setDialogOpen(true)
  }

  const handleDeleteEvent = (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id))
  }

  const handleSaveEvent = (event: CalendarEvent) => {
    setEvents((prev) => {
      const exists = prev.some((e) => e.id === event.id)
      return exists
        ? prev.map((e) => (e.id === event.id ? event : e))
        : [...prev, event]
    })
  }

  const handleToday = () => {
    setSelectedDate(new Date())
  }

  const selectedDateStr = format(selectedDate, "yyyy-MM-dd")
  const dayEventCount = events.filter((e) => e.date === selectedDateStr).length

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <HugeiconsIcon
                icon={Calendar03Icon}
                strokeWidth={2}
                className="size-4"
              />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
            {dayEventCount > 0 && viewMode === "day" && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                {dayEventCount} {dayEventCount === 1 ? "event" : "events"}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Schedule and events. Track your meetings, deadlines, and plans.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleToday}>
            Today
          </Button>
          <Button variant="secondary" size="sm" onClick={handleNewEvent}>
            <HugeiconsIcon
              icon={Add01Icon}
              strokeWidth={2}
              className="size-4"
            />
            New event
          </Button>
        </div>
      </div>

      {/* Main content: mini calendar + event list */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left: Mini calendar + view toggle */}
        <div className="space-y-4 lg:w-80 lg:shrink-0">
          <div className="rounded-lg border bg-card p-3">
            <MiniCalendar
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              events={events}
            />
          </div>

          {/* View toggle */}
          <div className="flex gap-1 rounded-lg border bg-card p-1">
            {(["day", "week"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={cn(
                  "flex-1 cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                  viewMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Event list */}
        <div className="min-w-0 flex-1">
          <EventList
            events={events}
            viewMode={viewMode}
            selectedDate={selectedDate}
            onDeleteEvent={handleDeleteEvent}
            onEditEvent={handleEditEvent}
          />
        </div>
      </div>

      {/* Event dialog */}
      <EventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        event={editingEvent}
        defaultDate={selectedDateStr}
        onSave={handleSaveEvent}
      />
    </div>
  )
}
