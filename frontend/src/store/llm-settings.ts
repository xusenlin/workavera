import { create } from "zustand"
import { persist } from "zustand/middleware"

export type LlmProtocol = "openai" | "anthropic"

export type LlmModelConfig = {
  id: string
  name: string
  modelId: string
  baseUrl: string
  apiKey: string
  protocol: LlmProtocol
}

type LlmSettingsState = {
  models: LlmModelConfig[]
  activeModelId: string | null
  addModel: (config: Omit<LlmModelConfig, "id">) => void
  updateModel: (id: string, patch: Partial<Omit<LlmModelConfig, "id">>) => void
  removeModel: (id: string) => void
  setActiveModel: (id: string) => void
}

function generateId() {
  return `model_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export const useLlmSettingsStore = create<LlmSettingsState>()(
  persist(
    (set) => ({
      models: [],
      activeModelId: null,
      addModel: (config) =>
        set((state) => {
          const model: LlmModelConfig = { ...config, id: generateId() }
          const isFirst = state.models.length === 0
          return {
            models: [...state.models, model],
            activeModelId: isFirst ? model.id : state.activeModelId,
          }
        }),
      updateModel: (id, patch) =>
        set((state) => ({
          models: state.models.map((m) =>
            m.id === id ? { ...m, ...patch } : m
          ),
        })),
      removeModel: (id) =>
        set((state) => {
          const models = state.models.filter((m) => m.id !== id)
          const activeModelId =
            state.activeModelId === id
              ? (models[0]?.id ?? null)
              : state.activeModelId
          return { models, activeModelId }
        }),
      setActiveModel: (id) => set({ activeModelId: id }),
    }),
    {
      name: "llm-models-storage",
    }
  )
)
