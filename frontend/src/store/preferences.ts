import { create } from "zustand"
import { ClientResponseError, type RecordModel } from "pocketbase"

import { pb } from "@/lib/pocketbase"

export type Theme = "system" | "light" | "dark"

type PreferenceRecord = RecordModel & {
  owner: string
  theme: Theme
  memory_enabled: boolean
  memory_auto_capture: boolean
  created: string
  updated: string
}

export type UserPreferences = {
  id: string
  owner: string
  theme: Theme
  memoryEnabled: boolean
  memoryAutoCapture: boolean
  created: string
  updated: string
}

type PreferencesState = {
  preferences: UserPreferences | null
  loading: boolean
  initialized: boolean
  error: string | null
  initialize: (force?: boolean) => Promise<void>
  clear: () => void
  updateTheme: (theme: Theme) => Promise<void>
  updateMemoryEnabled: (enabled: boolean) => Promise<void>
  updateMemoryAutoCapture: (enabled: boolean) => Promise<void>
}

let initializationPromise: Promise<void> | null = null
let loadedUserId: string | null = null

function toPreferences(record: PreferenceRecord): UserPreferences {
  return {
    id: record.id,
    owner: record.owner,
    theme: record.theme || "system",
    memoryEnabled: record.memory_enabled,
    memoryAutoCapture: record.memory_auto_capture,
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

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  preferences: null,
  loading: false,
  initialized: false,
  error: null,

  initialize: async (force = false) => {
    const userId = pb.authStore.record?.id ?? null
    if (!userId) {
      loadedUserId = null
      set({
        preferences: null,
        loading: false,
        initialized: false,
        error: null,
      })
      return
    }
    if (!force && get().initialized && loadedUserId === userId) return
    if (initializationPromise) return initializationPromise

    initializationPromise = (async () => {
      set({
        loading: true,
        error: null,
        ...(loadedUserId !== userId
          ? { preferences: null, initialized: false }
          : {}),
      })
      try {
        const record = await pb
          .collection("user_preferences")
          .getFirstListItem<PreferenceRecord>(`owner = "${userId}"`, {
            requestKey: null,
          })
        loadedUserId = userId
        set({ preferences: toPreferences(record), initialized: true })
      } catch (error) {
        set({
          preferences: null,
          initialized: false,
          error: errorMessage(error, "Could not load your preferences"),
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
      preferences: null,
      loading: false,
      initialized: false,
      error: null,
    })
  },

  updateTheme: async (theme) => {
    const current = get().preferences
    if (!current || current.theme === theme) return
    set({ preferences: { ...current, theme }, error: null })
    try {
      const record = await pb
        .collection("user_preferences")
        .update<PreferenceRecord>(current.id, { theme })
      set({ preferences: toPreferences(record) })
    } catch (error) {
      set({
        preferences: current,
        error: errorMessage(error, "Could not save your theme"),
      })
      throw error
    }
  },

  updateMemoryEnabled: async (enabled) => {
    const current = get().preferences
    if (!current || current.memoryEnabled === enabled) return
    set({
      preferences: { ...current, memoryEnabled: enabled },
      error: null,
    })
    try {
      const record = await pb
        .collection("user_preferences")
        .update<PreferenceRecord>(current.id, { memory_enabled: enabled })
      set({ preferences: toPreferences(record) })
    } catch (error) {
      set({
        preferences: current,
        error: errorMessage(error, "Could not update Chat memory"),
      })
      throw error
    }
  },

  updateMemoryAutoCapture: async (enabled) => {
    const current = get().preferences
    if (!current || current.memoryAutoCapture === enabled) return
    set({
      preferences: { ...current, memoryAutoCapture: enabled },
      error: null,
    })
    try {
      const record = await pb
        .collection("user_preferences")
        .update<PreferenceRecord>(current.id, {
          memory_auto_capture: enabled,
        })
      set({ preferences: toPreferences(record) })
    } catch (error) {
      set({
        preferences: current,
        error: errorMessage(error, "Could not update automatic memory"),
      })
      throw error
    }
  },
}))
