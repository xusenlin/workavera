import {
  addDays,
  addWeeks,
  endOfDay,
  format,
  isAfter,
  isBefore,
  startOfDay,
} from "date-fns"

export type EventColor = "blue" | "green" | "amber" | "red" | "purple"
export type RecurrenceFrequency =
  | "none"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
export type TaskPriority = "none" | "low" | "medium" | "high" | "urgent"

export type CalendarEvent = {
  id: string
  title: string
  description?: string
  startAt: string
  endAt: string
  allDay: boolean
  timezone: string
  location?: string
  color: EventColor
  recurrenceFrequency: RecurrenceFrequency
  recurrenceInterval: number
  reminderMinutesBefore: number
}

export type CalendarTask = {
  id: string
  title: string
  description?: string
  dueDate: string
  projectId: string
  projectName: string
  priority: TaskPriority
  completed: boolean
}

type CalendarItemBase = {
  key: string
  id: string
  title: string
  description?: string
  date: string
  color: EventColor
}

export type CalendarEventItem = CalendarItemBase & {
  type: "event"
  startTime: string
  endTime: string
  allDay: boolean
  location?: string
  event: CalendarEvent
}

export type CalendarTaskItem = CalendarItemBase & {
  type: "task"
  startTime: ""
  endTime: ""
  allDay: true
  location: string
  priority: TaskPriority
  completed: boolean
  projectId: string
}

export type CalendarItem = CalendarEventItem | CalendarTaskItem

export const EVENT_COLORS: Record<
  EventColor,
  { hex: string; bg: string; text: string }
> = {
  blue: {
    hex: "#3b82f6",
    bg: "bg-blue-500/10",
    text: "text-blue-600 dark:text-blue-400",
  },
  green: {
    hex: "#22c55e",
    bg: "bg-green-500/10",
    text: "text-green-600 dark:text-green-400",
  },
  amber: {
    hex: "#f59e0b",
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
  },
  red: {
    hex: "#ef4444",
    bg: "bg-red-500/10",
    text: "text-red-600 dark:text-red-400",
  },
  purple: {
    hex: "#8b5cf6",
    bg: "bg-purple-500/10",
    text: "text-purple-600 dark:text-purple-400",
  },
}

export const COLOR_OPTIONS: EventColor[] = [
  "blue",
  "green",
  "amber",
  "red",
  "purple",
]

const PRIORITY_COLORS: Record<TaskPriority, EventColor> = {
  none: "blue",
  low: "blue",
  medium: "amber",
  high: "amber",
  urgent: "red",
}

function monthlyOccurrence(base: Date, offset: number) {
  const candidate = new Date(
    base.getFullYear(),
    base.getMonth() + offset,
    base.getDate(),
    base.getHours(),
    base.getMinutes(),
    base.getSeconds(),
    base.getMilliseconds()
  )
  return candidate.getDate() === base.getDate() ? candidate : null
}

function yearlyOccurrence(base: Date, offset: number) {
  const candidate = new Date(
    base.getFullYear() + offset,
    base.getMonth(),
    base.getDate(),
    base.getHours(),
    base.getMinutes(),
    base.getSeconds(),
    base.getMilliseconds()
  )
  return candidate.getMonth() === base.getMonth() &&
    candidate.getDate() === base.getDate()
    ? candidate
    : null
}

function occurrenceAt(
  base: Date,
  frequency: RecurrenceFrequency,
  interval: number,
  index: number
) {
  const offset = interval * index
  if (frequency === "daily") return addDays(base, offset)
  if (frequency === "weekly") return addWeeks(base, offset)
  if (frequency === "monthly") return monthlyOccurrence(base, offset)
  if (frequency === "yearly") return yearlyOccurrence(base, offset)
  return index === 0 ? base : null
}

function expandEvent(
  event: CalendarEvent,
  rangeStart: Date,
  rangeEnd: Date
): CalendarEventItem[] {
  const baseStart = new Date(event.startAt)
  const baseEnd = new Date(event.endAt)
  const duration = baseEnd.getTime() - baseStart.getTime()
  const repeating = event.recurrenceFrequency !== "none"
  const items: CalendarEventItem[] = []

  // The range is UI-controlled and finite. This guard also protects malformed
  // legacy records from producing an unbounded expansion.
  for (let index = 0; index < 100_000; index++) {
    const occurrence = occurrenceAt(
      baseStart,
      event.recurrenceFrequency,
      Math.max(1, event.recurrenceInterval),
      index
    )
    if (!occurrence) {
      if (!repeating) break
      continue
    }
    if (isAfter(occurrence, rangeEnd)) break
    if (!isBefore(new Date(occurrence.getTime() + duration), rangeStart)) {
      const occurrenceEnd = new Date(occurrence.getTime() + duration)
      const date = format(occurrence, "yyyy-MM-dd")
      items.push({
        key: `event:${event.id}:${date}`,
        id: event.id,
        type: "event",
        title: event.title,
        description: event.description,
        date,
        startTime: format(occurrence, "HH:mm"),
        endTime: format(occurrenceEnd, "HH:mm"),
        allDay: event.allDay,
        color: event.color,
        location: event.location,
        event,
      })
    }
    if (!repeating) break
  }
  return items
}

export function buildCalendarItems(
  events: CalendarEvent[],
  tasks: CalendarTask[],
  rangeStart: Date,
  rangeEnd: Date
): CalendarItem[] {
  const start = startOfDay(rangeStart)
  const end = endOfDay(rangeEnd)
  const eventItems = events.flatMap((event) =>
    expandEvent(event, start, end)
  )
  const taskItems: CalendarTaskItem[] = tasks
    .filter((task) => {
      const due = new Date(`${task.dueDate}T00:00:00`)
      return !isBefore(due, start) && !isAfter(due, end)
    })
    .map((task) => ({
      key: `task:${task.id}`,
      id: task.id,
      type: "task",
      title: task.title,
      description: task.description,
      date: task.dueDate,
      startTime: "",
      endTime: "",
      allDay: true,
      color: PRIORITY_COLORS[task.priority],
      location: task.projectName,
      priority: task.priority,
      completed: task.completed,
      projectId: task.projectId,
    }))

  return [...eventItems, ...taskItems]
}
