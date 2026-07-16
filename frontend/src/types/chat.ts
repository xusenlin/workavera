import type { UIMessage } from "ai"

export type ConversationStatus = "active" | "archived"

export type Conversation = {
  id: string
  title: string
  status: ConversationStatus
  pinned: boolean
  model_config: string
  message_count: number
  tool_call_count: number
  total_tokens: number
  input_tokens: number
  output_tokens: number
  context_tokens: number
  last_message_at: string
  created: string
  updated: string
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
  /** Context-window tokens occupied after this run (last-step usage). */
  contextTokens?: number
  finishReason?: string
  stepCount?: number
  createdAt?: string
  updatedAt?: string
  error?: {
    code: string
    message: string
  }
}

export type CompactionData = {
  state: "started" | "done" | "failed"
  untilSequence?: number
}

export type ChatDataParts = {
  compaction: CompactionData
}

export type ChatUIMessage = UIMessage<ChatMessageMetadata, ChatDataParts>
