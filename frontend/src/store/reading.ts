import { ClientResponseError, type RecordModel } from "pocketbase"
import { toast } from "sonner"
import { create } from "zustand"

import { pb } from "@/lib/pocketbase"

export type ReadingStatus = "unread" | "read" | "archived"
export type ReadingStatusFilter = "all" | Exclude<ReadingStatus, "archived">

export type ReadingItemRecord = RecordModel & {
  owner: string
  project?: string
  url: string
  title: string
  description?: string
  tags?: unknown
  status: ReadingStatus
  pinned: boolean
  content_text?: string
  summary?: string
  key_points?: unknown
  summary_language?: string
}

type BoardProjectRecord = RecordModel & {
  name: string
  archived: boolean
}

export type ReadingItem = {
  id: string
  ownerId: string
  projectId?: string
  url: string
  title: string
  description?: string
  tags: string[]
  status: ReadingStatus
  pinned: boolean
  contentText?: string
  summary?: string
  keyPoints: string[]
  summaryLanguage?: string
  createdAt: string
  updatedAt: string
}

export type ReadingProject = {
  id: string
  name: string
}

export type ReadingItemInput = {
  projectId?: string
  url: string
  title: string
  description?: string
  tags?: string[]
  status?: ReadingStatus
  pinned?: boolean
  contentText?: string
  summary?: string
  keyPoints?: string[]
  summaryLanguage?: string
}

type ReadingListFilters = {
  query: string
  statusFilter: ReadingStatusFilter
  projectFilter: string
}

type ReadingState = ReadingListFilters & {
  items: ReadingItem[]
  openedItem: ReadingItem | null
  projects: ReadingProject[]
  page: number
  totalPages: number
  totalItems: number
  loading: boolean
  saving: boolean
  summarizing: boolean
  error: string | null
  fetchItems: (
    page?: number,
    filters?: Partial<ReadingListFilters>
  ) => Promise<void>
  fetchProjects: () => Promise<void>
  setQuery: (query: string) => Promise<void>
  setStatusFilter: (statusFilter: ReadingStatusFilter) => Promise<void>
  setProjectFilter: (projectFilter: string) => Promise<void>
  openItem: (id: string) => Promise<ReadingItem | null>
  rememberOpenedItem: (item: ReadingItem | null) => void
  addItem: (input: ReadingItemInput) => Promise<ReadingItem>
  updateItem: (id: string, patch: Partial<ReadingItemInput>) => Promise<void>
  togglePin: (id: string, pinned: boolean) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  summarizeItem: (id: string) => Promise<void>
}

let fetchItemsSequence = 0

export function readingErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : fallback
  }
  const response = error.response as
    | {
        message?: string
        data?: Record<string, { message?: string }>
      }
    | undefined
  const fieldMessage = response?.data
    ? Object.values(response.data)
        .map((item) => item.message)
        .find(Boolean)
    : undefined
  return response?.message || fieldMessage || error.message || fallback
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

export function toReadingItem(record: ReadingItemRecord): ReadingItem {
  return {
    id: record.id,
    ownerId: record.owner,
    projectId: record.project || undefined,
    url: record.url,
    title: record.title,
    description: record.description || undefined,
    tags: stringArray(record.tags),
    status: record.status,
    pinned: record.pinned ?? false,
    contentText: record.content_text || undefined,
    summary: record.summary || undefined,
    keyPoints: stringArray(record.key_points),
    summaryLanguage: record.summary_language || undefined,
    createdAt: record.created,
    updatedAt: record.updated,
  }
}

function toRecord(input: Partial<ReadingItemInput>) {
  const record: Record<string, unknown> = {}
  if (input.projectId !== undefined) record.project = input.projectId || ""
  if (input.url !== undefined) record.url = input.url
  if (input.title !== undefined) record.title = input.title
  if (input.description !== undefined)
    record.description = input.description || ""
  if (input.tags !== undefined) record.tags = input.tags
  if (input.status !== undefined) record.status = input.status
  if (input.pinned !== undefined) record.pinned = input.pinned
  if (input.contentText !== undefined)
    record.content_text = input.contentText || ""
  if (input.summary !== undefined) record.summary = input.summary || ""
  if (input.keyPoints !== undefined) record.key_points = input.keyPoints
  if (input.summaryLanguage !== undefined)
    record.summary_language = input.summaryLanguage || ""
  return record
}

function readingListFilter({
  query,
  statusFilter,
  projectFilter,
}: ReadingListFilters) {
  const clauses = ['status != "archived"']
  const params: Record<string, string> = {}
  if (statusFilter !== "all") {
    clauses.push("status = {:status}")
    params.status = statusFilter
  }
  if (projectFilter !== "all") {
    clauses.push("project = {:project}")
    params.project = projectFilter
  }
  if (query.trim()) {
    clauses.push(
      "(title ~ {:query} || url ~ {:query} || description ~ {:query} || summary ~ {:query} || tags ~ {:query} || key_points ~ {:query})"
    )
    params.query = query.trim()
  }
  return pb.filter(clauses.join(" && "), params)
}

export const useReadingStore = create<ReadingState>((set, get) => ({
  items: [],
  openedItem: null,
  projects: [],
  query: "",
  statusFilter: "all",
  projectFilter: "all",
  page: 1,
  totalPages: 1,
  totalItems: 0,
  loading: false,
  saving: false,
  summarizing: false,
  error: null,

  fetchItems: async (page = get().page, filterOverrides = {}) => {
    const sequence = ++fetchItemsSequence
    const filters = {
      query: filterOverrides.query ?? get().query,
      statusFilter: filterOverrides.statusFilter ?? get().statusFilter,
      projectFilter: filterOverrides.projectFilter ?? get().projectFilter,
    }
    set({ loading: true, error: null, page, ...filters })
    try {
      const result = await pb
        .collection("reading_items")
        .getList<ReadingItemRecord>(page, 20, {
          sort: "-pinned,-updated",
          filter: readingListFilter(filters),
          requestKey: null,
        })
      if (sequence !== fetchItemsSequence) return
      set({
        items: result.items.map(toReadingItem),
        page,
        totalPages: Math.max(1, result.totalPages),
        totalItems: result.totalItems,
      })
    } catch (error) {
      if (sequence !== fetchItemsSequence) return
      const message = readingErrorMessage(error, "Could not load reading items")
      set({ error: message })
      toast.error(message)
    } finally {
      if (sequence === fetchItemsSequence) set({ loading: false })
    }
  },

  fetchProjects: async () => {
    try {
      const records = await pb
        .collection("board_projects")
        .getFullList<BoardProjectRecord>({
          sort: "name",
          filter: "archived = false",
          requestKey: null,
        })
      set({
        projects: records.map((record) => ({
          id: record.id,
          name: record.name,
        })),
      })
    } catch (error) {
      toast.error(readingErrorMessage(error, "Could not load projects"))
    }
  },

  setQuery: async (query) => get().fetchItems(1, { query }),
  setStatusFilter: async (statusFilter) =>
    get().fetchItems(1, { statusFilter }),
  setProjectFilter: async (projectFilter) =>
    get().fetchItems(1, { projectFilter }),

  openItem: async (id) => {
    const itemId = id.trim()
    if (!itemId) return null
    const existing = get().items.find((item) => item.id === itemId)
    if (existing) {
      set({ openedItem: null })
      return existing
    }
    try {
      const record = await pb
        .collection("reading_items")
        .getOne<ReadingItemRecord>(itemId, { requestKey: null })
      const item = toReadingItem(record)
      set({ openedItem: item })
      return item
    } catch (error) {
      set({ openedItem: null })
      toast.error(readingErrorMessage(error, "Could not open reading item"))
      return null
    }
  },

  rememberOpenedItem: (item) => set({ openedItem: item }),

  addItem: async (input) => {
    const ownerId = pb.authStore.record?.id
    if (!ownerId) throw new Error("You must be signed in to add reading items")
    set({ saving: true, error: null })
    try {
      const record = await pb
        .collection("reading_items")
        .create<ReadingItemRecord>({
          owner: ownerId,
          status: input.status || "unread",
          ...toRecord(input),
        })
      const item = toReadingItem(record)
      set({ openedItem: item })
      await get().fetchItems(1)
      set({ saving: false })
      toast.success("Reading item added")
      return item
    } catch (error) {
      const message = readingErrorMessage(error, "Could not add reading item")
      set({ saving: false, error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  updateItem: async (id, patch) => {
    set({ saving: true, error: null })
    try {
      const record = await pb
        .collection("reading_items")
        .update<ReadingItemRecord>(id, toRecord(patch))
      const item = toReadingItem(record)
      set((state) => ({
        items: state.items.map((current) =>
          current.id === id ? item : current
        ),
        openedItem: state.openedItem?.id === id ? item : state.openedItem,
      }))
      await get().fetchItems()
      set({ saving: false })
      toast.success("Reading item updated")
    } catch (error) {
      const message = readingErrorMessage(
        error,
        "Could not update reading item"
      )
      set({ saving: false, error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  deleteItem: async (id) => {
    set({ saving: true, error: null })
    try {
      await pb.collection("reading_items").delete(id)
      const currentPage = get().page
      set((state) => ({
        openedItem: state.openedItem?.id === id ? null : state.openedItem,
      }))
      await get().fetchItems(currentPage)
      if (get().items.length === 0 && currentPage > 1 && get().totalItems > 0) {
        await get().fetchItems(currentPage - 1)
      }
      set({ saving: false })
      toast.success("Reading item deleted")
    } catch (error) {
      const message = readingErrorMessage(
        error,
        "Could not delete reading item"
      )
      set({ saving: false, error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  togglePin: async (id, pinned) => {
    try {
      const record = await pb
        .collection("reading_items")
        .update<ReadingItemRecord>(id, { pinned })
      const item = toReadingItem(record)
      set((state) => ({
        openedItem: state.openedItem?.id === id ? item : state.openedItem,
      }))
      await get().fetchItems()
    } catch (error) {
      const message = readingErrorMessage(error, "Could not update pin")
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  summarizeItem: async (id) => {
    set({ summarizing: true, error: null })
    try {
      const response = await pb.send<{
        contentText: string
        summary: string
        keyPoints: string[]
      }>(`/api/reading/items/${id}/summarize`, { method: "POST" })
      set((state) => ({
        items: state.items.map((item) =>
          item.id === id
            ? {
                ...item,
                contentText: response.contentText,
                summary: response.summary,
                keyPoints: response.keyPoints,
              }
            : item
        ),
        openedItem:
          state.openedItem?.id === id
            ? {
                ...state.openedItem,
                contentText: response.contentText,
                summary: response.summary,
                keyPoints: response.keyPoints,
              }
            : state.openedItem,
        summarizing: false,
      }))
    } catch (error) {
      const message = readingErrorMessage(
        error,
        "Could not fetch and summarize the article"
      )
      set({ summarizing: false, error: message })
      throw new Error(message, { cause: error })
    }
  },
}))

export const READING_STATUS_META: Record<
  ReadingStatus,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  unread: { label: "Unread", variant: "secondary" },
  read: { label: "Read", variant: "outline" },
  archived: { label: "Archived", variant: "outline" },
}
