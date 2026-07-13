import { create } from "zustand"
import { ClientResponseError } from "pocketbase"
import { toast } from "sonner"

import { pb } from "@/lib/pocketbase"

export type LlmProtocol =
  "openai" | "openai-compatible" | "anthropic" | "google"

export const DEFAULT_MAX_OUTPUT_TOKENS = 16384

export type LlmModelConfig = {
  id: string
  name: string
  modelId: string
  baseUrl: string
  protocol: LlmProtocol
  maxOutputTokens: number
  isDefault: boolean
  sharedFrom: string
  sharedFromName: string
  hasApiKey: boolean
  created: string
  updated: string
}

export type LlmModelInput = {
  name: string
  modelId: string
  baseUrl: string
  protocol: LlmProtocol
  maxOutputTokens?: number
  apiKey?: string
}

export type LlmShareTarget = {
  id: string
  name: string
}

type LlmSettingsState = {
  models: LlmModelConfig[]
  shareTargets: LlmShareTarget[]
  loading: boolean
  initialized: boolean
  error: string | null
  initialize: (force?: boolean) => Promise<void>
  clearError: () => void
  addModel: (input: LlmModelInput) => Promise<LlmModelConfig>
  updateModel: (
    id: string,
    patch: Partial<LlmModelInput>
  ) => Promise<LlmModelConfig>
  removeModel: (id: string) => Promise<void>
  setDefaultModel: (id: string) => Promise<void>
  loadShareTargets: () => Promise<LlmShareTarget[]>
  shareModel: (id: string, userIds: string[]) => Promise<number>
}

let initializationPromise: Promise<void> | null = null
let loadedUserId: string | null = null

function messageFromError(error: unknown, fallback: string) {
  if (error instanceof ClientResponseError) {
    return error.response?.message || fallback
  }
  return error instanceof Error ? error.message : fallback
}

function sortModels(models: LlmModelConfig[]) {
  return [...models].sort((a, b) => a.created.localeCompare(b.created))
}

export const useLlmSettingsStore = create<LlmSettingsState>((set, get) => ({
  models: [],
  shareTargets: [],
  loading: false,
  initialized: false,
  error: null,

  initialize: async (force = false) => {
    const userId = pb.authStore.record?.id ?? null
    if (!force && get().initialized && loadedUserId === userId) return
    if (initializationPromise) return initializationPromise

    initializationPromise = (async () => {
      set({ loading: true, error: null })
      try {
        const models = await pb.send<LlmModelConfig[]>("/api/llm/models", {
          method: "GET",
          requestKey: null,
        })
        loadedUserId = userId
        localStorage.removeItem("llm-models-storage")
        set({ models: sortModels(models), initialized: true })
      } catch (error) {
        const message = messageFromError(
          error,
          "Could not load model configurations"
        )
        set({ error: message, initialized: false })
        toast.error(message)
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

  clearError: () => set({ error: null }),

  addModel: async (input) => {
    set({ error: null })
    try {
      const model = await pb.send<LlmModelConfig>("/api/llm/models", {
        method: "POST",
        body: input,
      })
      set((state) => ({ models: sortModels([...state.models, model]) }))
      return model
    } catch (error) {
      const message = messageFromError(
        error,
        "Could not add model configuration"
      )
      set({ error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  updateModel: async (id, patch) => {
    set({ error: null })
    try {
      const model = await pb.send<LlmModelConfig>(`/api/llm/models/${id}`, {
        method: "PATCH",
        body: patch,
      })
      set((state) => ({
        models: sortModels(
          state.models.map((current) => (current.id === id ? model : current))
        ),
      }))
      return model
    } catch (error) {
      const message = messageFromError(
        error,
        "Could not update model configuration"
      )
      set({ error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  removeModel: async (id) => {
    set({ error: null })
    try {
      await pb.send(`/api/llm/models/${id}`, { method: "DELETE" })
      await get().initialize(true)
    } catch (error) {
      const message = messageFromError(
        error,
        "Could not delete model configuration"
      )
      set({ error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  setDefaultModel: async (id) => {
    set({ error: null })
    try {
      await pb.send<LlmModelConfig>(`/api/llm/models/${id}/default`, {
        method: "POST",
      })
      set((state) => ({
        models: sortModels(
          state.models.map((model) => ({
            ...model,
            isDefault: model.id === id,
          }))
        ),
      }))
    } catch (error) {
      const message = messageFromError(error, "Could not set the default model")
      set({ error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  loadShareTargets: async () => {
    try {
      const shareTargets = await pb.send<LlmShareTarget[]>(
        "/api/llm/share-targets",
        { method: "GET", requestKey: null }
      )
      set({ shareTargets })
      return shareTargets
    } catch (error) {
      const message = messageFromError(error, "Could not load users")
      set({ error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },

  shareModel: async (id, userIds) => {
    set({ error: null })
    try {
      const response = await pb.send<{ shared: number }>(
        `/api/llm/models/${id}/share`,
        { method: "POST", body: { userIds } }
      )
      return response.shared
    } catch (error) {
      const message = messageFromError(
        error,
        "Could not share model configuration"
      )
      set({ error: message })
      toast.error(message)
      throw new Error(message, { cause: error })
    }
  },
}))
