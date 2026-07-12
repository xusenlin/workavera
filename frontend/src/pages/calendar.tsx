import { useEffect, useMemo, useState } from "react"
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  format,
  startOfMonth,
  subMonths,
} from "date-fns"
import { useNavigate } from "react-router"

import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Calendar03Icon } from "@hugeicons/core-free-icons"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { MiniCalendar } from "@/components/calendar/mini-calendar"
import { EventList } from "@/components/calendar/event-list"
import { EventDialog } from "@/components/calendar/event-dialog"
import {
  buildCalendarItems,
  type CalendarEvent,
} from "@/lib/calendar-types"
import { cn } from "@/lib/utils"
import {
  useCalendarStore,
  type CalendarEventInput,
} from "@/store/calendar"

export function CalendarPage() {
  const navigate = useNavigate()
  const events = useCalendarStore((state) => state.events)
  const tasks = useCalendarStore((state) => state.tasks)
  const loading = useCalendarStore((state) => state.loading)
  const initialized = useCalendarStore((state) => state.initialized)
  const error = useCalendarStore((state) => state.error)
  const initialize = useCalendarStore((state) => state.initialize)
  const dispose = useCalendarStore((state) => state.dispose)
  const createEvent = useCalendarStore((state) => state.createEvent)
  const updateEvent = useCalendarStore((state) => state.updateEvent)
  const deleteEvent = useCalendarStore((state) => state.deleteEvent)
  const clearError = useCalendarStore((state) => state.clearError)

  const [selectedDate, setSelectedDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<"day" | "week">("day")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [deletingEvent, setDeletingEvent] = useState<CalendarEvent | null>(null)

  useEffect(() => {
    void initialize()
    return dispose
  }, [dispose, initialize])

  const items = useMemo(() => {
    const rangeStart = startOfMonth(subMonths(selectedDate, 1))
    const rangeEnd = endOfMonth(addMonths(selectedDate, 1))
    return buildCalendarItems(events, tasks, rangeStart, rangeEnd)
  }, [events, selectedDate, tasks])

  const selectedDateStr = format(selectedDate, "yyyy-MM-dd")
  const dayItemCount = items.filter(
    (item) => item.date === selectedDateStr
  ).length

  const handleSaveEvent = async (input: CalendarEventInput) => {
    if (editingEvent) await updateEvent(editingEvent.id, input)
    else await createEvent(input)
  }

  const moveSelection = (direction: -1 | 1) => {
    setSelectedDate((current) =>
      viewMode === "day"
        ? addDays(current, direction)
        : addWeeks(current, direction)
    )
  }

  if (loading && !initialized) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
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
            {dayItemCount > 0 && viewMode === "day" && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                {dayItemCount} {dayItemCount === 1 ? "item" : "items"}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Your personal events and Board task deadlines in one place.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => moveSelection(-1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedDate(new Date())}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => moveSelection(1)}
          >
            Next
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setEditingEvent(null)
              setDialogOpen(true)
            }}
          >
            <HugeiconsIcon
              icon={Add01Icon}
              strokeWidth={2}
              className="size-4"
            />
            New event
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={clearError}>
            Dismiss
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="space-y-4 lg:w-80 lg:shrink-0">
          <div className="rounded-lg border bg-card p-3">
            <MiniCalendar
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              events={items}
            />
          </div>

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

        <div className="min-w-0 flex-1">
          <EventList
            items={items}
            viewMode={viewMode}
            selectedDate={selectedDate}
            onDeleteEvent={setDeletingEvent}
            onEditEvent={(event) => {
              setEditingEvent(event)
              setDialogOpen(true)
            }}
            onOpenTask={(taskId, projectId) =>
              navigate("/board", { state: { taskId, projectId } })
            }
          />
        </div>
      </div>

      <EventDialog
        key={`${dialogOpen}:${editingEvent?.id ?? "new"}:${selectedDateStr}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        event={editingEvent}
        defaultDate={selectedDateStr}
        onSave={handleSaveEvent}
      />

      <AlertDialog
        open={Boolean(deletingEvent)}
        onOpenChange={(open) => {
          if (!open) setDeletingEvent(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete event?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingEvent?.recurrenceFrequency === "none"
                ? `This will permanently delete “${deletingEvent.title}”.`
                : `This will permanently delete the entire “${deletingEvent?.title}” repeating series.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!deletingEvent) return
                void deleteEvent(deletingEvent.id)
                  .catch(() => {})
                  .finally(() => setDeletingEvent(null))
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
