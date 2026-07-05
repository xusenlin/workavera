import type { UIMessage } from "ai"

export type ConversationStatus = "active" | "archived"

export type Conversation = {
  id: string
  title: string
  status: ConversationStatus
  pinned: boolean
  messageCount: number
  toolCallCount: number
  totalTokens: number
  inputTokens: number
  outputTokens: number
  lastMessageAt: string
  createdAt: string
  updatedAt: string
}

export type ChatMessageMetadata = {
  conversationId?: string
  status?: "pending" | "streaming" | "complete" | "error" | "cancelled"
  runId?: string
  model?: {
    configId: string
    modelId: string
    name: string
    protocol: string
  }
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    reasoningTokens: number
    cacheCreationTokens: number
    cacheReadTokens: number
  }
  finishReason?: string
  stepCount?: number
  createdAt?: string
  updatedAt?: string
  error?: {
    code: string
    message: string
  }
}

export type ChatUIMessage = UIMessage<ChatMessageMetadata>
