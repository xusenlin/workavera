import { create } from "zustand"
import { ClientResponseError, type RecordModel } from "pocketbase"
import { toast } from "sonner"

import { pb } from "@/lib/pocketbase"
import type {
  CalendarEvent,
  CalendarTask,
  EventColor,
  RecurrenceFrequency,
  TaskPriority,
} from "@/lib/calendar-types"

export type CalendarEventInput = Omit<CalendarEvent, "id">

type EventRecord = RecordModel & {
  owner: string
  title: string
  description: string
  start_at: string
  end_at: string
  all_day: boolean
  timezone: string
  location: string
  color: EventColor
  recurrence_frequency: RecurrenceFrequency
  recurrence_interval: number
  reminder_minutes_before: number
}

type ProjectRecord = RecordModel & { name: string }
type StateRecord = RecordModel & { category: "pending" | "active" | "completed" }

type TaskRecord = RecordModel & {
  project: string
  title: string
  description: string
  priority: TaskPriority
  due_date: string
  expand?: { project?: ProjectRecord; state?: StateRecord }
}

type CalendarState = {
  events: CalendarEvent[]
  tasks: CalendarTask[]
  loading: boolean
  initialized: boolean
  error: string | null
  initialize: () => Promise<void>
  dispose: () => void
  createEvent: (input: CalendarEventInput) => Promise<void>
  updateEvent: (id: string, input: CalendarEventInput) => Promise<void>
  deleteEvent: (id: string) => Promise<void>
  clearError: () => void
}

let unsubscribers: Array<() => void> = []
let connectionWanted = false

function toEvent(record: EventRecord): CalendarEvent {
  return {
    id: record.id,
    title: record.title,
    description: record.description || undefined,
    startAt: record.start_at,
    endAt: record.end_at,
    allDay: record.all_day,
    timezone: record.timezone,
    location: record.location || undefined,
    color: record.color,
    recurrenceFrequency: record.recurrence_frequency,
    recurrenceInterval: record.recurrence_interval,
    reminderMinutesBefore: record.reminder_minutes_before,
  }
}

function toTask(record: TaskRecord): CalendarTask {
  return {
    id: record.id,
    title: record.title,
    description: record.description || undefined,
    dueDate: record.due_date.slice(0, 10),
    projectId: record.project,
    projectName: record.expand?.project?.name || "Board",
    priority: record.priority,
    completed: record.expand?.state?.category === "completed",
  }
}

function toRecord(input: CalendarEventInput) {
  return {
    title: input.title,
    description: input.description || "",
    start_at: input.startAt,
    end_at: input.endAt,
    all_day: input.allDay,
    timezone: input.timezone,
    location: input.location || "",
    color: input.color,
    recurrence_frequency: input.recurrenceFrequency,
    recurrence_interval: input.recurrenceInterval,
    reminder_minutes_before: input.reminderMinutesBefore,
  }
}

function upsert<T extends { id: string }>(items: T[], item: T) {
  const index = items.findIndex((current) => current.id === item.id)
  if (index < 0) return [...items, item]
  const next = [...items]
  next[index] = item
  return next
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ClientResponseError) {
    const fieldError = Object.values(error.response?.data ?? {}).find(
      (value): value is { message: string } =>
        typeof value === "object" &&
        value !== null &&
        "message" in value &&
        typeof value.message === "string"
    )
    return fieldError?.message || error.response?.message || fallback
  }
  return error instanceof Error ? error.message : fallback
}

async function loadCalendar() {
  const [events, tasks] = await Promise.all([
    pb.collection("calendar_events").getFullList<EventRecord>({
      sort: "start_at",
      requestKey: null,
    }),
    pb.collection("board_tasks").getFullList<TaskRecord>({
      filter: 'due_date != ""',
      sort: "due_date",
      expand: "project,state",
      requestKey: null,
    }),
  ])
  return { events: events.map(toEvent), tasks: tasks.map(toTask) }
}

async function connectRealtime(
  set: (
    patch:
      | Partial<CalendarState>
      | ((state: CalendarState) => Partial<CalendarState>)
  ) => void
) {
  unsubscribers.forEach((unsubscribe) => unsubscribe())
  unsubscribers = []

  const eventUnsubscribe = await pb
    .collection("calendar_events")
    .subscribe<EventRecord>("*", (message) => {
      set((state) => ({
        events:
          message.action === "delete"
            ? state.events.filter((event) => event.id !== message.record.id)
            : upsert(state.events, toEvent(message.record)),
      }))
    })
  unsubscribers.push(eventUnsubscribe)

  const taskUnsubscribe = await pb
    .collection("board_tasks")
    .subscribe<TaskRecord>(
      "*",
      (message) => {
        set((state) => {
          if (message.action === "delete" || !message.record.due_date) {
            return {
              tasks: state.tasks.filter(
                (task) => task.id !== message.record.id
              ),
            }
          }
          return { tasks: upsert(state.tasks, toTask(message.record)) }
        })
      },
      { expand: "project,state", requestKey: null }
    )
  unsubscribers.push(taskUnsubscribe)
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  events: [],
  tasks: [],
  loading: false,
  initialized: false,
  error: null,

  initialize: async () => {
    connectionWanted = true
    if (get().loading || get().initialized) return
    set({ loading: true, error: null })
    try {
      const data = await loadCalendar()
      set({ ...data, initialized: true })
      if (connectionWanted) await connectRealtime(set)
    } catch (error) {
      const message = errorMessage(error, "Could not load the calendar")
      set({ error: message })
      toast.error(message)
    } finally {
      set({ loading: false })
    }
  },

  dispose: () => {
    connectionWanted = false
    unsubscribers.forEach((unsubscribe) => unsubscribe())
    unsubscribers = []
    set({ initialized: false })
  },

  createEvent: async (input) => {
    const owner = pb.authStore.record?.id
    if (!owner) throw new Error("You must be signed in")
    try {
      const record = await pb
        .collection("calendar_events")
        .create<EventRecord>({ owner, ...toRecord(input) })
      set((state) => ({ events: upsert(state.events, toEvent(record)) }))
    } catch (error) {
      const message = errorMessage(error, "Could not create the event")
      toast.error(message)
      throw error
    }
  },

  updateEvent: async (id, input) => {
    try {
      const record = await pb
        .collection("calendar_events")
        .update<EventRecord>(id, toRecord(input))
      set((state) => ({ events: upsert(state.events, toEvent(record)) }))
    } catch (error) {
      const message = errorMessage(error, "Could not update the event")
      toast.error(message)
      throw error
    }
  },

  deleteEvent: async (id) => {
    try {
      await pb.collection("calendar_events").delete(id)
      set((state) => ({
        events: state.events.filter((event) => event.id !== id),
      }))
    } catch (error) {
      const message = errorMessage(error, "Could not delete the event")
      toast.error(message)
      throw error
    }
  },

  clearError: () => set({ error: null }),
}))
