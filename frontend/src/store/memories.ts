import { create } from "zustand"
import { ClientResponseError, type RecordModel } from "pocketbase"

import { pb } from "@/lib/pocketbase"

export type MemoryCategory =
  "preference" | "personal" | "work" | "goal" | "constraint"
export type MemoryOrigin = "manual" | "explicit" | "automatic"

type MemoryRecord = RecordModel & {
  owner: string
  category: MemoryCategory
  content: string
  active: boolean
  origin: MemoryOrigin
  source_conversation?: string
  source_message?: string
  created: string
  updated: string
}

export type ChatMemory = {
  id: string
  owner: string
  category: MemoryCategory
  content: string
  active: boolean
  origin: MemoryOrigin
  sourceConversation?: string
  sourceMessage?: string
  created: string
  updated: string
}

export type MemoryInput = {
  category: MemoryCategory
  content: string
}

type MemoriesState = {
  memories: ChatMemory[]
  loading: boolean
  initialized: boolean
  error: string | null
  initialize: (force?: boolean) => Promise<void>
  clear: () => void
  add: (input: MemoryInput) => Promise<ChatMemory>
  update: (
    id: string,
    patch: Partial<MemoryInput & { active: boolean }>
  ) => Promise<ChatMemory>
  remove: (id: string) => Promise<void>
  clearAll: () => Promise<number>
}

let initializationPromise: Promise<void> | null = null
let loadedUserId: string | null = null

function toMemory(record: MemoryRecord): ChatMemory {
  return {
    id: record.id,
    owner: record.owner,
    category: record.category,
    content: record.content,
    active: record.active,
    origin: record.origin,
    sourceConversation: record.source_conversation || undefined,
    sourceMessage: record.source_message || undefined,
    created: record.created,
    updated: record.updated,
  }
}

function messageFromError(error: unknown, fallback: string) {
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

function sortMemories(memories: ChatMemory[]) {
  return [...memories].sort((a, b) => b.updated.localeCompare(a.updated))
}

export const useMemoriesStore = create<MemoriesState>((set, get) => ({
  memories: [],
  loading: false,
  initialized: false,
  error: null,

  initialize: async (force = false) => {
    const userId = pb.authStore.record?.id ?? null
    if (!userId) {
      get().clear()
      return
    }
    if (!force && get().initialized && loadedUserId === userId) return
    if (initializationPromise) return initializationPromise

    initializationPromise = (async () => {
      set({ loading: true, error: null })
      try {
        const records = await pb
          .collection("chat_memories")
          .getFullList<MemoryRecord>({ sort: "-updated", requestKey: null })
        loadedUserId = userId
        set({
          memories: records.map(toMemory),
          initialized: true,
        })
      } catch (error) {
        set({
          error: messageFromError(error, "Could not load Chat memories"),
          initialized: false,
        })
      } finally {
        set({ loading: false })
      }
    })()

    try {
      await initializationPromise
    } finally {
      initializationPromise = null
    }
  },

  clear: () => {
    loadedUserId = null
    initializationPromise = null
    set({
      memories: [],
      loading: false,
      initialized: false,
      error: null,
    })
  },

  add: async (input) => {
    set({ error: null })
    try {
      const record = await pb.collection("chat_memories").create<MemoryRecord>({
        category: input.category,
        content: input.content.trim(),
      })
      const memory = toMemory(record)
      set((state) => ({ memories: sortMemories([memory, ...state.memories]) }))
      return memory
    } catch (error) {
      const message = messageFromError(error, "Could not add the memory")
      set({ error: message })
      throw new Error(message, { cause: error })
    }
  },

  update: async (id, patch) => {
    set({ error: null })
    const body = {
      ...patch,
      ...(patch.content !== undefined ? { content: patch.content.trim() } : {}),
    }
    try {
      const record = await pb
        .collection("chat_memories")
        .update<MemoryRecord>(id, body)
      const memory = toMemory(record)
      set((state) => ({
        memories: sortMemories(
          state.memories.map((current) =>
            current.id === id ? memory : current
          )
        ),
      }))
      return memory
    } catch (error) {
      const message = messageFromError(error, "Could not update the memory")
      set({ error: message })
      throw new Error(message, { cause: error })
    }
  },

  remove: async (id) => {
    set({ error: null })
    try {
      await pb.collection("chat_memories").delete(id)
      set((state) => ({
        memories: state.memories.filter((memory) => memory.id !== id),
      }))
    } catch (error) {
      const message = messageFromError(error, "Could not delete the memory")
      set({ error: message })
      throw new Error(message, { cause: error })
    }
  },

  clearAll: async () => {
    const ids = get().memories.map((memory) => memory.id)
    let deleted = 0
    for (const id of ids) {
      try {
        await pb.collection("chat_memories").delete(id)
        deleted += 1
      } catch {
        // Refresh below so partial success is represented accurately.
      }
    }
    await get().initialize(true)
    if (get().memories.length > 0) {
      const message = `Deleted ${deleted} memories, but ${get().memories.length} could not be removed.`
      set({ error: message })
      throw new Error(message)
    }
    return deleted
  },
}))
