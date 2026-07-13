import { useState } from "react"

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  type CalendarEvent,
  type EventColor,
  type RecurrenceFrequency,
  COLOR_OPTIONS,
  EVENT_COLORS,
} from "@/lib/calendar-types"
import type { CalendarEventInput } from "@/store/calendar"
import { cn } from "@/lib/utils"
import {
  addDaysToDate,
  formatZonedDate,
  formatZonedTime,
  zonedDateTimeToDate,
} from "@/lib/timezone"

type EventSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: CalendarEvent | null
  defaultDate: string
  timezone: string
  onSave: (event: CalendarEventInput) => Promise<void>
}

type EventForm = {
  title: string
  description: string
  date: string
  startTime: string
  endTime: string
  allDay: boolean
  color: EventColor
  location: string
  recurrenceFrequency: RecurrenceFrequency
  recurrenceInterval: string
  reminderMinutesBefore: string
}

function emptyForm(defaultDate: string): EventForm {
  return {
    title: "",
    description: "",
    date: defaultDate,
    startTime: "09:00",
    endTime: "10:00",
    allDay: false,
    color: "blue",
    location: "",
    recurrenceFrequency: "none",
    recurrenceInterval: "1",
    reminderMinutesBefore: "-1",
  }
}

function formFromEvent(event: CalendarEvent, timezone: string): EventForm {
  return {
    title: event.title,
    description: event.description ?? "",
    date: formatZonedDate(event.startAt, timezone),
    startTime: formatZonedTime(event.startAt, timezone),
    endTime: formatZonedTime(event.endAt, timezone),
    allDay: event.allDay,
    color: event.color,
    location: event.location ?? "",
    recurrenceFrequency: event.recurrenceFrequency,
    recurrenceInterval: String(event.recurrenceInterval),
    reminderMinutesBefore: String(event.reminderMinutesBefore),
  }
}

export function EventSheet({
  open,
  onOpenChange,
  event,
  defaultDate,
  timezone,
  onSave,
}: EventSheetProps) {
  const [form, setForm] = useState<EventForm>(() =>
    event ? formFromEvent(event, timezone) : emptyForm(defaultDate)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const isEditing = Boolean(event)

  const handleSave = async () => {
    if (!form.title.trim()) return
    const interval = Number(form.recurrenceInterval)
    if (!Number.isInteger(interval) || interval < 1) {
      setError("Repeat interval must be a positive whole number.")
      return
    }

    const start = zonedDateTimeToDate(
      form.date,
      form.allDay ? "00:00:00" : `${form.startTime}:00`,
      timezone
    )
    const end = form.allDay
      ? zonedDateTimeToDate(addDaysToDate(form.date, 1), "00:00:00", timezone)
      : zonedDateTimeToDate(form.date, `${form.endTime}:00`, timezone)
    if (end <= start) {
      setError("End time must be after start time.")
      return
    }

    setSaving(true)
    setError("")
    try {
      await onSave({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        allDay: form.allDay,
        timezone,
        location: form.location.trim() || undefined,
        color: form.color,
        recurrenceFrequency: form.recurrenceFrequency,
        recurrenceInterval: interval,
        reminderMinutesBefore: Number(form.reminderMinutesBefore),
      })
      onOpenChange(false)
    } catch {
      setError("The event could not be saved. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg!">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit event" : "New event"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? event?.recurrenceFrequency === "none"
                ? "Update the event details below."
                : "Changes apply to the entire repeating series."
              : "Create a new event on your personal calendar."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 overflow-y-auto px-6">
          <div className="space-y-1.5">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Event title"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Date</Label>
            <DatePicker
              value={form.date}
              onChange={(date) => setForm({ ...form, date })}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.allDay}
              onChange={(e) => setForm({ ...form, allDay: e.target.checked })}
              className="size-4 accent-primary"
            />
            All day
          </label>

          {!form.allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="event-start">Start time</Label>
                <Input
                  id="event-start"
                  type="time"
                  value={form.startTime}
                  onChange={(e) =>
                    setForm({ ...form, startTime: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="event-end">End time</Label>
                <Input
                  id="event-end"
                  type="time"
                  value={form.endTime}
                  onChange={(e) =>
                    setForm({ ...form, endTime: e.target.value })
                  }
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Repeat</Label>
              <Select
                value={form.recurrenceFrequency}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    recurrenceFrequency: value as RecurrenceFrequency,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Does not repeat</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.recurrenceFrequency !== "none" && (
              <div className="space-y-1.5">
                <Label htmlFor="event-interval">Every</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="event-interval"
                    type="number"
                    min={1}
                    step={1}
                    value={form.recurrenceInterval}
                    onChange={(e) =>
                      setForm({ ...form, recurrenceInterval: e.target.value })
                    }
                  />
                  <span className="text-xs text-muted-foreground">
                    {{
                      daily: "day",
                      weekly: "week",
                      monthly: "month",
                      yearly: "year",
                    }[form.recurrenceFrequency] ?? "period"}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Reminder</Label>
            <Select
              value={form.reminderMinutesBefore}
              onValueChange={(value) =>
                setForm({ ...form, reminderMinutesBefore: value })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-1">No reminder</SelectItem>
                <SelectItem value="0">At start time</SelectItem>
                <SelectItem value="5">5 minutes before</SelectItem>
                <SelectItem value="10">10 minutes before</SelectItem>
                <SelectItem value="30">30 minutes before</SelectItem>
                <SelectItem value="60">1 hour before</SelectItem>
                <SelectItem value="1440">1 day before</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Notifications use the timezone configured in system settings.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex gap-2">
              {COLOR_OPTIONS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Use ${color}`}
                  onClick={() => setForm({ ...form, color })}
                  className={cn(
                    "flex size-8 cursor-pointer items-center justify-center rounded-full border-2 transition-colors",
                    form.color === color
                      ? "border-foreground"
                      : "border-transparent"
                  )}
                  style={{ backgroundColor: EVENT_COLORS[color].hex }}
                >
                  {form.color === color && (
                    <span className="size-2 rounded-full bg-white" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="event-location">Location (optional)</Label>
            <Input
              id="event-location"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Meeting room, Zoom, etc."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="event-desc">Description (optional)</Label>
            <Textarea
              id="event-desc"
              rows={4}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Add a note..."
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <SheetFooter className="flex-row items-center justify-between gap-2">
          <div />
          <div className="flex gap-2">
            <SheetClose asChild>
              <Button variant="ghost">Cancel</Button>
            </SheetClose>
            <Button
              onClick={() => void handleSave()}
              disabled={!form.title.trim() || saving}
            >
              {saving ? "Saving..." : isEditing ? "Save changes" : "Create event"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
