import { create } from "zustand"
import { persist } from "zustand/middleware"

import {
  seedConversations,
  seedMessages,
} from "@/data/chat-seed"
import type {
  Conversation,
  Message,
  MessageBlock,
} from "@/types/chat"

function generateId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

type ChatState = {
  conversations: Conversation[]
  messagesByConversation: Record<string, Message[]>
  activeConversationId: string | null

  // selectors / actions
  setActiveConversation: (id: string | null) => void
  getMessages: (conversationId: string) => Message[]
  createConversation: (title?: string, modelId?: string) => string
  deleteConversation: (id: string) => void
  togglePin: (id: string) => void
  renameConversation: (id: string, title: string) => void
  archiveConversation: (id: string) => void
  setConversationModel: (id: string, modelId: string) => void

  addMessage: (
    conversationId: string,
    role: Message["role"],
    blocks: Omit<
      MessageBlock,
      "id" | "messageId" | "sequenceOrder" | "createdAt" | "updatedAt"
    >[]
  ) => string
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: seedConversations,
      messagesByConversation: seedMessages,
      activeConversationId: seedConversations[0]?.id ?? null,

      setActiveConversation: (id) => set({ activeConversationId: id }),

      getMessages: (conversationId) =>
        get().messagesByConversation[conversationId] ?? [],

      createConversation: (title = "New conversation", modelId = "claude-sonnet-4-20250514") => {
        const id = generateId("conv")
        const nowIso = new Date().toISOString()
        const conversation: Conversation = {
          id,
          title,
          modelId,
          status: "active",
          pinned: false,
          messageCount: 0,
          toolCallCount: 0,
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          createdAt: nowIso,
          updatedAt: nowIso,
        }
        set((state) => ({
          conversations: [conversation, ...state.conversations],
          messagesByConversation: {
            ...state.messagesByConversation,
            [id]: [],
          },
          activeConversationId: id,
        }))
        return id
      },

      deleteConversation: (id) =>
        set((state) => {
          const rest = { ...state.messagesByConversation }
          delete rest[id]
          const conversations = state.conversations.filter((c) => c.id !== id)
          const activeConversationId =
            state.activeConversationId === id
              ? (conversations[0]?.id ?? null)
              : state.activeConversationId
          return {
            conversations,
            messagesByConversation: rest,
            activeConversationId,
          }
        }),

      togglePin: (id) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, pinned: !c.pinned, updatedAt: new Date().toISOString() } : c
          ),
        })),

      renameConversation: (id, title) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, title, updatedAt: new Date().toISOString() } : c
          ),
        })),

      archiveConversation: (id) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id
              ? { ...c, status: "archived", updatedAt: new Date().toISOString() }
              : c
          ),
        })),

      setConversationModel: (id, modelId) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id
              ? { ...c, modelId, updatedAt: new Date().toISOString() }
              : c
          ),
        })),

      addMessage: (conversationId, role, blocks) => {
        const msgId = generateId("msg")
        const nowIso = new Date().toISOString()
        const existing = get().messagesByConversation[conversationId] ?? []
        const conversation = get().conversations.find((c) => c.id === conversationId)
        const fullBlocks: MessageBlock[] = blocks.map((b, i) => ({
          ...b,
          id: generateId("blk"),
          messageId: msgId,
          sequenceOrder: i,
          createdAt: nowIso,
          updatedAt: nowIso,
        }))
        const message: Message = {
          id: msgId,
          conversationId,
          role,
          modelName: role === "assistant" ? (conversation?.modelId ?? "") : "",
          inputTokens: 0,
          outputTokens: 0,
          createdAt: nowIso,
          updatedAt: nowIso,
          status: "complete",
          sequenceOrder: existing.length,
          blocks: fullBlocks,
        }
        set((state) => ({
          messagesByConversation: {
            ...state.messagesByConversation,
            [conversationId]: [...existing, message],
          },
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messageCount: c.messageCount + 1,
                  updatedAt: nowIso,
                }
              : c
          ),
        }))
        return msgId
      },
    }),
    {
      name: "chat-storage",
    }
  )
)
