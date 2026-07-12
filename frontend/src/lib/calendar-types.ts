export type EventColor = "blue" | "green" | "amber" | "red" | "purple"

export type CalendarItemType = "event" | "task"

export type CalendarItem = {
  id: string
  type: CalendarItemType
  title: string
  description?: string
  date: string // YYYY-MM-DD
  startTime: string // HH:mm
  endTime: string // HH:mm
  color: EventColor
  /** For events: a physical/virtual location. For tasks: the source project name. */
  location?: string
  /** Task-specific: priority level. */
  priority?: "none" | "low" | "medium" | "high" | "urgent"
}

export const EVENT_COLORS: Record<
  EventColor,
  { hex: string; bg: string; text: string }
> = {
  blue: { hex: "#3b82f6", bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" },
  green: { hex: "#22c55e", bg: "bg-green-500/10", text: "text-green-600 dark:text-green-400" },
  amber: { hex: "#f59e0b", bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
  red: { hex: "#ef4444", bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400" },
  purple: { hex: "#8b5cf6", bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400" },
}

export const COLOR_OPTIONS: EventColor[] = ["blue", "green", "amber", "red", "purple"]

const PRIORITY_COLORS: Record<string, EventColor> = {
  none: "blue",
  low: "blue",
  medium: "amber",
  high: "amber",
  urgent: "red",
}

function todayISO(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

export const MOCK_ITEMS: CalendarItem[] = [
  // ── Custom events ──
  {
    id: "evt-1",
    type: "event",
    title: "Team standup",
    description: "Daily sync with the engineering team",
    date: todayISO(0),
    startTime: "09:00",
    endTime: "09:30",
    color: "blue",
    location: "Zoom",
  },
  {
    id: "evt-2",
    type: "event",
    title: "Design review",
    description: "Review the new calendar page mockups",
    date: todayISO(0),
    startTime: "11:00",
    endTime: "12:00",
    color: "amber",
    location: "Meeting room A",
  },
  {
    id: "evt-3",
    type: "event",
    title: "Sprint planning",
    date: todayISO(1),
    startTime: "14:00",
    endTime: "15:30",
    color: "green",
    location: "Conference room B",
  },
  {
    id: "evt-4",
    type: "event",
    title: "1:1 with Alex",
    date: todayISO(2),
    startTime: "10:00",
    endTime: "10:30",
    color: "purple",
  },
  {
    id: "evt-5",
    type: "event",
    title: "Client demo",
    description: "Demo the new AI workspace features",
    date: todayISO(6),
    startTime: "13:00",
    endTime: "14:00",
    color: "amber",
    location: "Client office",
  },
  {
    id: "evt-6",
    type: "event",
    title: "Weekly retro",
    date: todayISO(4),
    startTime: "16:00",
    endTime: "17:00",
    color: "green",
    location: "Zoom",
  },
  {
    id: "evt-7",
    type: "event",
    title: "Architecture workshop",
    date: todayISO(-2),
    startTime: "10:00",
    endTime: "12:00",
    color: "purple",
  },
  {
    id: "evt-8",
    type: "event",
    title: "Quarterly OKR review",
    date: todayISO(9),
    startTime: "09:30",
    endTime: "11:00",
    color: "red",
    location: "Main hall",
  },

  // ── Board tasks (with dueDate) ──
  {
    id: "task-1",
    type: "task",
    title: "Implement calendar page",
    description: "Build the calendar UI with mini calendar and event list",
    date: todayISO(0),
    startTime: "00:00",
    endTime: "23:59",
    color: PRIORITY_COLORS["high"],
    location: "Workavera Platform",
    priority: "high",
  },
  {
    id: "task-2",
    type: "task",
    title: "Fix docs_replace validation bug",
    date: todayISO(0),
    startTime: "00:00",
    endTime: "23:59",
    color: PRIORITY_COLORS["urgent"],
    location: "Workavera Platform",
    priority: "urgent",
  },
  {
    id: "task-3",
    type: "task",
    title: "Design API endpoints for events",
    description: "Define REST API schema for calendar events CRUD",
    date: todayISO(3),
    startTime: "00:00",
    endTime: "23:59",
    color: PRIORITY_COLORS["medium"],
    location: "Workavera Platform",
    priority: "medium",
  },
  {
    id: "task-4",
    type: "task",
    title: "Write migration tests",
    date: todayISO(2),
    startTime: "00:00",
    endTime: "23:59",
    color: PRIORITY_COLORS["low"],
    location: "Board Engine",
    priority: "low",
  },
  {
    id: "task-5",
    type: "task",
    title: "Product launch v2.0",
    description: "Final release deadline",
    date: todayISO(5),
    startTime: "00:00",
    endTime: "23:59",
    color: PRIORITY_COLORS["urgent"],
    location: "Workavera Platform",
    priority: "urgent",
  },
  {
    id: "task-6",
    type: "task",
    title: "Code review: reading tools",
    date: todayISO(-1),
    startTime: "00:00",
    endTime: "23:59",
    color: PRIORITY_COLORS["none"],
    location: "Board Engine",
    priority: "none",
  },
]

/** @deprecated Use CalendarItem instead. Kept for backward compat. */
export type CalendarEvent = CalendarItem

/** @deprecated Use MOCK_ITEMS instead. */
export const MOCK_EVENTS = MOCK_ITEMS
