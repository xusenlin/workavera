import { create } from "zustand"
import { ClientResponseError, type RecordModel } from "pocketbase"
import { toast } from "sonner"

import { pb } from "@/lib/pocketbase"
import { useLlmSettingsStore } from "@/store/llm-settings"

export type NotificationType = "model_share" | "task_due" | "calendar_event"

export type NotificationData = {
  senderId?: string
  sourceModelId?: string
  senderName?: string
  modelName?: string
  shareStatus?: "pending" | "accepted" | "rejected"
  taskId?: string
  projectId?: string
  dueDate?: string
  eventId?: string
  occurrenceDate?: string
  instanceStart?: string
}

type NotificationRecord = RecordModel & {
  recipient: string
  type: NotificationType
  title: string
  body: string
  data?: NotificationData
  read_at?: string
}

export type AppNotification = {
  id: string
  type: NotificationType
  title: string
  body: string
  data: NotificationData
  readAt?: string
  created: string
  updated: string
}

type NotificationFilter = "all" | "unread"

type NotificationsState = {
  recent: AppNotification[]
  items: AppNotification[]
  unreadCount: number
  filter: NotificationFilter
  page: number
  totalPages: number
  loading: boolean
  initialized: boolean
  initialize: () => Promise<void>
  dispose: () => void
  loadRecent: () => Promise<void>
  loadPage: (page?: number, filter?: NotificationFilter) => Promise<void>
  openNotification: (id: string) => Promise<AppNotification | null>
  setFilter: (filter: NotificationFilter) => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  respondToShare: (
    notification: AppNotification,
    decision: "accept" | "reject"
  ) => Promise<void>
}

let unsubscribe: (() => void) | null = null
let initializePromise: Promise<void> | null = null

function toNotification(record: NotificationRecord): AppNotification {
  return {
    id: record.id,
    type: record.type,
    title: record.title,
    body: record.body || "",
    data: record.data ?? {},
    readAt: record.read_at || undefined,
    created: record.created,
    updated: record.updated,
  }
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ClientResponseError) {
    return error.response?.message || fallback
  }
  return error instanceof Error ? error.message : fallback
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  recent: [],
  items: [],
  unreadCount: 0,
  filter: "all",
  page: 1,
  totalPages: 1,
  loading: false,
  initialized: false,

  initialize: async () => {
    if (get().initialized || initializePromise)
      return initializePromise ?? undefined
    initializePromise = (async () => {
      await get().loadRecent()
      if (unsubscribe) unsubscribe()
      unsubscribe = await pb
        .collection("notifications")
        .subscribe<NotificationRecord>("*", () => {
          void get().loadRecent()
          if (get().items.length > 0) void get().loadPage()
        })
      set({ initialized: true })
    })()
    try {
      await initializePromise
    } finally {
      initializePromise = null
    }
  },

  dispose: () => {
    unsubscribe?.()
    unsubscribe = null
    set({ initialized: false, recent: [], items: [], unreadCount: 0 })
  },

  loadRecent: async () => {
    if (!pb.authStore.isValid) return
    try {
      const [recent, unread] = await Promise.all([
        pb.collection("notifications").getList<NotificationRecord>(1, 5, {
          sort: "-created",
          requestKey: null,
        }),
        pb.collection("notifications").getList<NotificationRecord>(1, 1, {
          filter: 'read_at = ""',
          requestKey: null,
        }),
      ])
      set({
        recent: recent.items.map(toNotification),
        unreadCount: unread.totalItems,
      })
    } catch (error) {
      console.error("Could not load notifications", error)
    }
  },

  loadPage: async (page = get().page, filter = get().filter) => {
    set({ loading: true })
    try {
      const result = await pb
        .collection("notifications")
        .getList<NotificationRecord>(page, 20, {
          sort: "-created",
          filter: filter === "unread" ? 'read_at = ""' : undefined,
          requestKey: null,
        })
      set({
        items: result.items.map(toNotification),
        page,
        filter,
        totalPages: result.totalPages || 1,
      })
    } catch (error) {
      toast.error(errorMessage(error, "Could not load notifications"))
    } finally {
      set({ loading: false })
    }
  },

  openNotification: async (id) => {
    const notificationId = id.trim()
    if (!notificationId) return null
    const existing = [...get().items, ...get().recent].find(
      (item) => item.id === notificationId
    )
    if (existing) return existing
    try {
      const record = await pb
        .collection("notifications")
        .getOne<NotificationRecord>(notificationId, { requestKey: null })
      return toNotification(record)
    } catch (error) {
      toast.error(errorMessage(error, "Could not open notification"))
      return null
    }
  },

  setFilter: async (filter) => get().loadPage(1, filter),

  markRead: async (id) => {
    const current = [...get().recent, ...get().items].find(
      (item) => item.id === id
    )
    if (current?.readAt) return
    const readAt = new Date().toISOString()
    set((state) => ({
      recent: state.recent.map((item) =>
        item.id === id ? { ...item, readAt } : item
      ),
      items: state.items.map((item) =>
        item.id === id ? { ...item, readAt } : item
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }))
    try {
      await pb.send(`/api/notifications/${id}/read`, { method: "POST" })
    } catch (error) {
      await get().loadRecent()
      if (get().items.length > 0) await get().loadPage()
      toast.error(errorMessage(error, "Could not mark notification as read"))
    }
  },

  markAllRead: async () => {
    try {
      await pb.send("/api/notifications/read-all", { method: "POST" })
      const readAt = new Date().toISOString()
      set((state) => ({
        recent: state.recent.map((item) => ({
          ...item,
          readAt: item.readAt ?? readAt,
        })),
        items:
          state.filter === "unread"
            ? []
            : state.items.map((item) => ({
                ...item,
                readAt: item.readAt ?? readAt,
              })),
        unreadCount: 0,
      }))
    } catch (error) {
      toast.error(
        errorMessage(error, "Could not mark all notifications as read")
      )
    }
  },

  respondToShare: async (notification, decision) => {
    try {
      await pb.send(`/api/llm/shares/${notification.id}/respond`, {
        method: "POST",
        body: { decision },
      })
      const shareStatus = decision === "accept" ? "accepted" : "rejected"
      set((state) => ({
        recent: state.recent.map((item) =>
          item.id === notification.id
            ? { ...item, data: { ...item.data, shareStatus } }
            : item
        ),
        items: state.items.map((item) =>
          item.id === notification.id
            ? { ...item, data: { ...item.data, shareStatus } }
            : item
        ),
      }))
      await get().markRead(notification.id)
      if (decision === "accept")
        await useLlmSettingsStore.getState().initialize(true)
      toast.success(
        decision === "accept"
          ? "Model configuration added"
          : "Share invitation declined"
      )
    } catch (error) {
      toast.error(errorMessage(error, "Could not respond to invitation"))
      throw error
    }
  },
}))
