import { create } from "zustand"
import { ClientResponseError, type RecordModel } from "pocketbase"
import { toast } from "sonner"

import { pb } from "@/lib/pocketbase"
import { useLlmSettingsStore } from "@/store/llm-settings"

export type NotificationType = "model_share" | "task_due" | "calendar_event"
export type NotificationStatus = "active" | "archived"
export type NotificationReadFilter = "all" | "unread" | "read"
export type NotificationTypeFilter = "all" | NotificationType

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
  status: NotificationStatus
  pinned: boolean
}

export type AppNotification = {
  id: string
  type: NotificationType
  title: string
  body: string
  data: NotificationData
  readAt?: string
  status: NotificationStatus
  pinned: boolean
  created: string
  updated: string
}

type NotificationListFilters = {
  query: string
  readFilter: NotificationReadFilter
  typeFilter: NotificationTypeFilter
}

type NotificationsState = NotificationListFilters & {
  recent: AppNotification[]
  items: AppNotification[]
  unreadCount: number
  page: number
  totalPages: number
  totalItems: number
  loading: boolean
  initialized: boolean
  initialize: () => Promise<void>
  dispose: () => void
  loadRecent: () => Promise<void>
  loadPage: (
    page?: number,
    filters?: Partial<NotificationListFilters>
  ) => Promise<void>
  openNotification: (id: string) => Promise<AppNotification | null>
  setQuery: (query: string) => Promise<void>
  setReadFilter: (filter: NotificationReadFilter) => Promise<void>
  setTypeFilter: (filter: NotificationTypeFilter) => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  togglePin: (id: string, pinned: boolean) => Promise<void>
  archive: (id: string) => Promise<void>
  restore: (id: string) => Promise<void>
  deleteNotification: (id: string) => Promise<void>
  respondToShare: (
    notification: AppNotification,
    decision: "accept" | "reject"
  ) => Promise<void>
}

let unsubscribe: (() => void) | null = null
let initializePromise: Promise<void> | null = null
let loadPageSequence = 0

function toNotification(record: NotificationRecord): AppNotification {
  return {
    id: record.id,
    type: record.type,
    title: record.title,
    body: record.body || "",
    data: record.data ?? {},
    readAt: record.read_at || undefined,
    status: record.status || "active",
    pinned: record.pinned ?? false,
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

function listFilter({
  query,
  readFilter,
  typeFilter,
}: NotificationListFilters) {
  const clauses = ['status = "active"']
  const params: Record<string, string> = {}
  if (readFilter === "unread") clauses.push('read_at = ""')
  if (readFilter === "read") clauses.push('read_at != ""')
  if (typeFilter !== "all") {
    clauses.push("type = {:type}")
    params.type = typeFilter
  }
  if (query.trim()) {
    clauses.push("(title ~ {:query} || body ~ {:query})")
    params.query = query.trim()
  }
  return pb.filter(clauses.join(" && "), params)
}

function replaceNotification(
  items: AppNotification[],
  notification: AppNotification
) {
  return items.map((item) =>
    item.id === notification.id ? notification : item
  )
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  recent: [],
  items: [],
  unreadCount: 0,
  query: "",
  readFilter: "all",
  typeFilter: "all",
  page: 1,
  totalPages: 1,
  totalItems: 0,
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
          void get().loadPage()
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
    set({
      initialized: false,
      recent: [],
      items: [],
      unreadCount: 0,
      totalItems: 0,
    })
  },

  loadRecent: async () => {
    if (!pb.authStore.isValid) return
    try {
      const [recent, unread] = await Promise.all([
        pb.collection("notifications").getList<NotificationRecord>(1, 5, {
          sort: "-pinned,-created",
          filter: 'status = "active"',
          requestKey: null,
        }),
        pb.collection("notifications").getList<NotificationRecord>(1, 1, {
          filter: 'status = "active" && read_at = ""',
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

  loadPage: async (page = get().page, filterOverrides = {}) => {
    const sequence = ++loadPageSequence
    const filters = {
      query: filterOverrides.query ?? get().query,
      readFilter: filterOverrides.readFilter ?? get().readFilter,
      typeFilter: filterOverrides.typeFilter ?? get().typeFilter,
    }
    set({ loading: true, page, ...filters })
    try {
      const result = await pb
        .collection("notifications")
        .getList<NotificationRecord>(page, 20, {
          sort: "-pinned,-created",
          filter: listFilter(filters),
          requestKey: null,
        })
      if (sequence !== loadPageSequence) return
      set({
        items: result.items.map(toNotification),
        page,
        totalPages: Math.max(1, result.totalPages),
        totalItems: result.totalItems,
      })
    } catch (error) {
      if (sequence !== loadPageSequence) return
      toast.error(errorMessage(error, "Could not load notifications"))
    } finally {
      if (sequence === loadPageSequence) set({ loading: false })
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

  setQuery: async (query) => get().loadPage(1, { query }),
  setReadFilter: async (readFilter) => get().loadPage(1, { readFilter }),
  setTypeFilter: async (typeFilter) => get().loadPage(1, { typeFilter }),

  markRead: async (id) => {
    const current = [...get().recent, ...get().items].find(
      (item) => item.id === id
    )
    if (current?.readAt) return
    try {
      const record = await pb
        .collection("notifications")
        .update<NotificationRecord>(id, { read_at: new Date().toISOString() })
      const notification = toNotification(record)
      set((state) => ({
        recent: replaceNotification(state.recent, notification),
        items: replaceNotification(state.items, notification),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }))
      if (get().readFilter !== "all") await get().loadPage()
    } catch (error) {
      toast.error(errorMessage(error, "Could not mark notification as read"))
    }
  },

  markAllRead: async () => {
    try {
      await pb.send("/api/notifications/read-all", { method: "POST" })
      await Promise.all([get().loadRecent(), get().loadPage()])
    } catch (error) {
      toast.error(
        errorMessage(error, "Could not mark all notifications as read")
      )
    }
  },

  togglePin: async (id, pinned) => {
    try {
      await pb.collection("notifications").update(id, { pinned })
      await Promise.all([get().loadRecent(), get().loadPage()])
    } catch (error) {
      toast.error(errorMessage(error, "Could not update notification pin"))
      throw error
    }
  },

  archive: async (id) => {
    try {
      await pb
        .collection("notifications")
        .update(id, { status: "archived", pinned: false })
      const nextPage =
        get().items.length === 1 ? Math.max(1, get().page - 1) : get().page
      await Promise.all([get().loadRecent(), get().loadPage(nextPage)])
      toast.success("Notification archived")
    } catch (error) {
      toast.error(errorMessage(error, "Could not archive notification"))
      throw error
    }
  },

  restore: async (id) => {
    try {
      await pb.collection("notifications").update(id, { status: "active" })
      await Promise.all([get().loadRecent(), get().loadPage()])
      toast.success("Notification restored")
    } catch (error) {
      toast.error(errorMessage(error, "Could not restore notification"))
      throw error
    }
  },

  deleteNotification: async (id) => {
    try {
      await pb.collection("notifications").delete(id)
      const currentPage = get().page
      await Promise.all([get().loadRecent(), get().loadPage(currentPage)])
      if (get().items.length === 0 && currentPage > 1 && get().totalItems > 0) {
        await get().loadPage(currentPage - 1)
      }
      toast.success("Notification deleted")
    } catch (error) {
      toast.error(errorMessage(error, "Could not delete notification"))
      throw error
    }
  },

  respondToShare: async (notification, decision) => {
    try {
      await pb.send(`/api/llm/shares/${notification.id}/respond`, {
        method: "POST",
        body: { decision },
      })
      await Promise.all([get().loadRecent(), get().loadPage()])
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
