import { ClientResponseError, type RecordModel } from "pocketbase"
import { toast } from "sonner"
import { create } from "zustand"

import { pb } from "@/lib/pocketbase"

export type ReadingStatus = "unread" | "read" | "archived"

type ReadingItemRecord = RecordModel & {
  owner: string
  project?: string
  url: string
  title: string
  description?: string
  tags?: unknown
  status: ReadingStatus
  content_text?: string
  summary?: string
  key_points?: unknown
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
  contentText?: string
  summary?: string
  keyPoints: string[]
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
  contentText?: string
  summary?: string
  keyPoints?: string[]
}

type ReadingState = {
  items: ReadingItem[]
  projects: ReadingProject[]
  loading: boolean
  saving: boolean
  summarizing: boolean
  error: string | null
  fetchItems: () => Promise<void>
  fetchProjects: () => Promise<void>
  addItem: (input: ReadingItemInput) => Promise<ReadingItem>
  updateItem: (id: string, patch: Partial<ReadingItemInput>) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  summarizeItem: (id: string) => Promise<void>
}

function errorMessage(error: unknown, fallback: string) {
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

function toReadingItem(record: ReadingItemRecord): ReadingItem {
  return {
    id: record.id,
    ownerId: record.owner,
    projectId: record.project || undefined,
    url: record.url,
    title: record.title,
    description: record.description || undefined,
    tags: stringArray(record.tags),
    status: record.status,
    contentText: record.content_text || undefined,
    summary: record.summary || undefined,
    keyPoints: stringArray(record.key_points),
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
  if (input.contentText !== undefined)
    record.content_text = input.contentText || ""
  if (input.summary !== undefined) record.summary = input.summary || ""
  if (input.keyPoints !== undefined) record.key_points = input.keyPoints
  return record
}

function upsertById(items: ReadingItem[], next: ReadingItem) {
  const exists = items.some((item) => item.id === next.id)
  if (!exists) return [next, ...items]
  return items.map((item) => (item.id === next.id ? next : item))
}

export const useReadingStore = create<ReadingState>((set) => ({
  items: [],
  projects: [],
  loading: false,
  saving: false,
  summarizing: false,
  error: null,

  fetchItems: async () => {
    set({ loading: true, error: null })
    try {
      const records = await pb
        .collection("reading_items")
        .getFullList<ReadingItemRecord>({
          sort: "-updated",
          requestKey: null,
        })
      set({ items: records.map(toReadingItem), loading: false })
    } catch (error) {
      const message = errorMessage(error, "Could not load reading items")
      set({ loading: false, error: message })
      toast.error(message)
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
      toast.error(errorMessage(error, "Could not load projects"))
    }
  },

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
      set((state) => ({ items: upsertById(state.items, item), saving: false }))
      toast.success("Reading item added")
      return item
    } catch (error) {
      const message = errorMessage(error, "Could not add reading item")
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
      set((state) => ({ items: upsertById(state.items, item), saving: false }))
      toast.success("Reading item updated")
    } catch (error) {
      const message = errorMessage(error, "Could not update reading item")
      set({ saving: false, error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  deleteItem: async (id) => {
    set({ saving: true, error: null })
    try {
      await pb.collection("reading_items").delete(id)
      set((state) => ({
        items: state.items.filter((item) => item.id !== id),
        saving: false,
      }))
      toast.success("Reading item deleted")
    } catch (error) {
      const message = errorMessage(error, "Could not delete reading item")
      set({ saving: false, error: message })
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
        summarizing: false,
      }))
    } catch (error) {
      const message = errorMessage(
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
