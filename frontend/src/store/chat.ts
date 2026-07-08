import { create } from "zustand"
import { toast } from "sonner"

import { pb } from "@/lib/pocketbase"
import { extractErrorMessage } from "@/lib/error"
import type { Conversation } from "@/types/chat"

const PER_PAGE = 20

type ChatState = {
  conversations: Conversation[]
  activeConversationId: string | null
  loading: boolean
  initialized: boolean
  error: string | null
  page: number
  totalPages: number
  totalItems: number
  initialize: (force?: boolean) => Promise<void>
  refresh: () => Promise<void>
  setPage: (page: number) => Promise<void>
  setActiveConversation: (id: string | null) => void
  createConversation: (title?: string) => Promise<string>
  deleteConversation: (id: string) => Promise<void>
  togglePin: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  archiveConversation: (id: string) => Promise<void>
  loadArchived: (
    page?: number,
    perPage?: number
  ) => Promise<ConversationsPage>
  unarchiveConversation: (id: string) => Promise<void>
}

type ConversationsPage = {
  items: Conversation[]
  totalItems: number
  page: number
  perPage: number
  totalPages: number
}

let initializationPromise: Promise<void> | null = null

async function fetchPage(page: number) {
  return pb.collection("chat_conversations").getList<Conversation>(page, PER_PAGE, {
    filter: "status = 'active'",
    sort: "-pinned,-last_message_at,-updated",
    requestKey: null,
  })
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  loading: false,
  initialized: false,
  error: null,
  page: 1,
  totalPages: 0,
  totalItems: 0,

  initialize: async (force = false) => {
    if (!force && get().initialized) return
    if (initializationPromise) return initializationPromise
    initializationPromise = (async () => {
      set({ loading: true, error: null })
      try {
        const result = await fetchPage(get().page)
        set({
          conversations: result.items,
          totalItems: result.totalItems,
          totalPages: result.totalPages,
          initialized: true,
          activeConversationId:
            get().activeConversationId &&
            result.items.some((item) => item.id === get().activeConversationId)
              ? get().activeConversationId
              : (result.items[0]?.id ?? null),
        })
        localStorage.removeItem("chat-storage")
      } catch (error) {
        const message = extractErrorMessage(error, "Could not load conversations")
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

  refresh: async () => {
    try {
      const result = await fetchPage(get().page)
      set({
        conversations: result.items,
        totalItems: result.totalItems,
        totalPages: result.totalPages,
      })
    } catch (error) {
      toast.error(extractErrorMessage(error, "Could not refresh conversations"))
    }
  },

  setPage: async (page) => {
    const clamped = Math.max(1, Math.min(get().totalPages, page))
    if (clamped === get().page) return
    set({ loading: true })
    try {
      const result = await fetchPage(clamped)
      set({
        conversations: result.items,
        page: clamped,
        totalItems: result.totalItems,
        totalPages: result.totalPages,
      })
    } catch (error) {
      toast.error(extractErrorMessage(error, "Could not load page"))
    } finally {
      set({ loading: false })
    }
  },

  setActiveConversation: (id) => set({ activeConversationId: id }),

  createConversation: async (title = "New conversation") => {
    try {
      const conversation = await pb
        .collection("chat_conversations")
        .create<Conversation>({ title })
      set((state) => ({
        conversations: [conversation, ...state.conversations],
        totalItems: state.totalItems + 1,
        totalPages: Math.ceil((state.totalItems + 1) / PER_PAGE),
        activeConversationId: conversation.id,
      }))
      return conversation.id
    } catch (error) {
      toast.error(extractErrorMessage(error, "Could not create conversation"))
      throw error
    }
  },

  deleteConversation: async (id) => {
    try {
      await pb.collection("chat_conversations").delete(id)
      set((state) => {
        const conversations = state.conversations.filter((item) => item.id !== id)
        const totalItems = Math.max(0, state.totalItems - 1)
        const totalPages = totalItems > 0 ? Math.ceil(totalItems / PER_PAGE) : 0
        return {
          conversations,
          totalItems,
          totalPages,
          activeConversationId:
            state.activeConversationId === id
              ? (conversations[0]?.id ?? null)
              : state.activeConversationId,
        }
      })
    } catch (error) {
      toast.error(extractErrorMessage(error, "Could not delete conversation"))
      throw error
    }
  },

  togglePin: async (id) => {
    const current = get().conversations.find((item) => item.id === id)
    if (!current) return
    try {
      const conversation = await pb
        .collection("chat_conversations")
        .update<Conversation>(id, { pinned: !current.pinned })
      set((state) => ({
        conversations: state.conversations.map((item) =>
          item.id === id ? conversation : item
        ),
      }))
    } catch (error) {
      toast.error(extractErrorMessage(error, "Could not pin conversation"))
      throw error
    }
  },

  renameConversation: async (id, title) => {
    try {
      const conversation = await pb
        .collection("chat_conversations")
        .update<Conversation>(id, { title })
      set((state) => ({
        conversations: state.conversations.map((item) =>
          item.id === id ? conversation : item
        ),
      }))
    } catch (error) {
      toast.error(extractErrorMessage(error, "Could not rename conversation"))
      throw error
    }
  },

  archiveConversation: async (id) => {
    try {
      await pb.collection("chat_conversations").update(id, { status: "archived" })
      set((state) => {
        const conversations = state.conversations.filter((item) => item.id !== id)
        const totalItems = Math.max(0, state.totalItems - 1)
        const totalPages = totalItems > 0 ? Math.ceil(totalItems / PER_PAGE) : 0
        return {
          conversations,
          totalItems,
          totalPages,
          activeConversationId:
            state.activeConversationId === id
              ? (state.conversations.find((item) => item.id !== id)?.id ?? null)
              : state.activeConversationId,
        }
      })
    } catch (error) {
      toast.error(extractErrorMessage(error, "Could not archive conversation"))
      throw error
    }
  },

  loadArchived: async (page = 1, perPage = 10) => {
    return pb.collection("chat_conversations").getList<Conversation>(page, perPage, {
      filter: "status = 'archived'",
      sort: "-last_message_at,-updated",
      requestKey: null,
    })
  },

  unarchiveConversation: async (id) => {
    try {
      const conversation = await pb
        .collection("chat_conversations")
        .update<Conversation>(id, { status: "active" })
      set((state) => ({
        conversations: [conversation, ...state.conversations],
        totalItems: state.totalItems + 1,
        totalPages: Math.ceil((state.totalItems + 1) / PER_PAGE),
        activeConversationId: state.activeConversationId ?? conversation.id,
      }))
    } catch (error) {
      toast.error(extractErrorMessage(error, "Could not unarchive conversation"))
      throw error
    }
  },
}))
