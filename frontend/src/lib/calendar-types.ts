export type EventColor = "blue" | "green" | "amber" | "red" | "purple"

export type CalendarEvent = {
  id: string
  title: string
  description?: string
  date: string // YYYY-MM-DD
  startTime: string // HH:mm
  endTime: string // HH:mm
  color: EventColor
  location?: string
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

function todayISO(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

export const MOCK_EVENTS: CalendarEvent[] = [
  {
    id: "evt-1",
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
    title: "Sprint planning",
    date: todayISO(1),
    startTime: "14:00",
    endTime: "15:30",
    color: "green",
    location: "Conference room B",
  },
  {
    id: "evt-4",
    title: "1:1 with Alex",
    date: todayISO(2),
    startTime: "10:00",
    endTime: "10:30",
    color: "purple",
  },
  {
    id: "evt-5",
    title: "Product launch deadline",
    description: "Final release of v2.0",
    date: todayISO(3),
    startTime: "17:00",
    endTime: "18:00",
    color: "red",
  },
  {
    id: "evt-6",
    title: "Code review session",
    date: todayISO(-1),
    startTime: "15:00",
    endTime: "16:00",
    color: "blue",
  },
  {
    id: "evt-7",
    title: "Weekly retro",
    date: todayISO(4),
    startTime: "16:00",
    endTime: "17:00",
    color: "green",
    location: "Zoom",
  },
  {
    id: "evt-8",
    title: "Client demo",
    description: "Demo the new AI workspace features",
    date: todayISO(6),
    startTime: "13:00",
    endTime: "14:00",
    color: "amber",
    location: "Client office",
  },
  {
    id: "evt-9",
    title: "Architecture workshop",
    date: todayISO(-2),
    startTime: "10:00",
    endTime: "12:00",
    color: "purple",
  },
  {
    id: "evt-10",
    title: "Quarterly OKR review",
    date: todayISO(9),
    startTime: "09:30",
    endTime: "11:00",
    color: "red",
    location: "Main hall",
  },
]
