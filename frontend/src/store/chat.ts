import { create } from "zustand"

import { pb } from "@/lib/pocketbase"
import type { Conversation } from "@/types/chat"

type ChatState = {
  conversations: Conversation[]
  activeConversationId: string | null
  loading: boolean
  initialized: boolean
  error: string | null
  initialize: (force?: boolean) => Promise<void>
  refresh: () => Promise<void>
  setActiveConversation: (id: string | null) => void
  createConversation: (title?: string) => Promise<string>
  deleteConversation: (id: string) => Promise<void>
  togglePin: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  archiveConversation: (id: string) => Promise<void>
}

let initializationPromise: Promise<void> | null = null

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "Chat request failed"
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  loading: false,
  initialized: false,
  error: null,

  initialize: async (force = false) => {
    if (!force && get().initialized) return
    if (initializationPromise) return initializationPromise
    initializationPromise = (async () => {
      set({ loading: true, error: null })
      try {
        const conversations = await pb.send<Conversation[]>(
          "/api/chat/conversations",
          { method: "GET", requestKey: null }
        )
        set((state) => ({
          conversations,
          initialized: true,
          activeConversationId:
            state.activeConversationId &&
            conversations.some((item) => item.id === state.activeConversationId)
              ? state.activeConversationId
              : (conversations[0]?.id ?? null),
        }))
        localStorage.removeItem("chat-storage")
      } catch (error) {
        set({ error: messageFromError(error), initialized: false })
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

  refresh: async () => get().initialize(true),
  setActiveConversation: (id) => set({ activeConversationId: id }),

  createConversation: async (title = "New conversation") => {
    const conversation = await pb.send<Conversation>(
      "/api/chat/conversations",
      { method: "POST", body: { title } }
    )
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      activeConversationId: conversation.id,
    }))
    return conversation.id
  },

  deleteConversation: async (id) => {
    await pb.send(`/api/chat/conversations/${id}`, { method: "DELETE" })
    set((state) => {
      const conversations = state.conversations.filter((item) => item.id !== id)
      return {
        conversations,
        activeConversationId:
          state.activeConversationId === id
            ? (conversations[0]?.id ?? null)
            : state.activeConversationId,
      }
    })
  },

  togglePin: async (id) => {
    const current = get().conversations.find((item) => item.id === id)
    if (!current) return
    const conversation = await pb.send<Conversation>(
      `/api/chat/conversations/${id}`,
      { method: "PATCH", body: { pinned: !current.pinned } }
    )
    set((state) => ({
      conversations: state.conversations.map((item) =>
        item.id === id ? conversation : item
      ),
    }))
  },

  renameConversation: async (id, title) => {
    const conversation = await pb.send<Conversation>(
      `/api/chat/conversations/${id}`,
      { method: "PATCH", body: { title } }
    )
    set((state) => ({
      conversations: state.conversations.map((item) =>
        item.id === id ? conversation : item
      ),
    }))
  },

  archiveConversation: async (id) => {
    const conversation = await pb.send<Conversation>(
      `/api/chat/conversations/${id}`,
      { method: "PATCH", body: { status: "archived" } }
    )
    set((state) => ({
      conversations: state.conversations.map((item) =>
        item.id === id ? conversation : item
      ),
    }))
  },
}))
