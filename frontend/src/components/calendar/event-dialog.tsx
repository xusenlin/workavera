import { useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import {
  type CalendarEvent,
  COLOR_OPTIONS,
  EVENT_COLORS,
} from "@/lib/calendar-types"
import { cn } from "@/lib/utils"

type EventDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: CalendarEvent | null
  defaultDate: string
  onSave: (event: CalendarEvent) => void
}

function emptyForm(defaultDate: string): CalendarEvent {
  return {
    id: "",
    title: "",
    description: "",
    date: defaultDate,
    startTime: "09:00",
    endTime: "10:00",
    color: "blue",
    location: "",
  }
}

export function EventDialog({
  open,
  onOpenChange,
  event,
  defaultDate,
  onSave,
}: EventDialogProps) {
  const [form, setForm] = useState<CalendarEvent>(
    event ?? emptyForm(defaultDate)
  )
  const [lastOpen, setLastOpen] = useState(false)

  // Reset form when the dialog opens
  if (open && !lastOpen) {
    setForm(event ?? emptyForm(defaultDate))
    setLastOpen(true)
  }
  if (!open && lastOpen) {
    setLastOpen(false)
  }

  const isEditing = Boolean(event?.id)

  const handleSave = () => {
    if (!form.title.trim()) return
    onSave({
      ...form,
      id: form.id || `evt-${Date.now()}`,
      title: form.title.trim(),
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit event" : "New event"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the event details below."
              : "Create a new event on your calendar."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
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

          {/* Date */}
          <div className="space-y-1.5">
            <Label>Date</Label>
            <DatePicker
              value={form.date}
              onChange={(value) => setForm({ ...form, date: value })}
            />
          </div>

          {/* Time range */}
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
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              />
            </div>
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex gap-2">
              {COLOR_OPTIONS.map((color) => (
                <button
                  key={color}
                  type="button"
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

          {/* Location */}
          <div className="space-y-1.5">
            <Label htmlFor="event-location">Location (optional)</Label>
            <Input
              id="event-location"
              value={form.location ?? ""}
              onChange={(e) =>
                setForm({ ...form, location: e.target.value })
              }
              placeholder="Meeting room, Zoom, etc."
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="event-desc">Description (optional)</Label>
            <Input
              id="event-desc"
              value={form.description ?? ""}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Add a note..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!form.title.trim()}>
            {isEditing ? "Save changes" : "Create event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
