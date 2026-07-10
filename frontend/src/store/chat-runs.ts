import { create } from "zustand"

export type ChatRunSummary = {
  messageId: string
  conversationId: string
  runId?: string
  updated: string
}

type ChatRunsState = {
  runs: Record<string, ChatRunSummary>
  replace: (runs: ChatRunSummary[]) => void
  upsert: (run: ChatRunSummary) => void
  remove: (messageId: string) => void
  clear: () => void
}

export const useChatRunsStore = create<ChatRunsState>((set) => ({
  runs: {},
  replace: (runs) =>
    set({
      runs: Object.fromEntries(runs.map((run) => [run.messageId, run])),
    }),
  upsert: (run) =>
    set((state) => ({ runs: { ...state.runs, [run.messageId]: run } })),
  remove: (messageId) =>
    set((state) => {
      const runs = { ...state.runs }
      delete runs[messageId]
      return { runs }
    }),
  clear: () => set({ runs: {} }),
}))
