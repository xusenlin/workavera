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
  /** Final-step usage: the breakdown of what occupies the context window. */
  contextUsage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    reasoningTokens: number
    cacheCreationTokens: number
    cacheReadTokens: number
  }
  /** Context-window tokens occupied after this run (last-step usage). */
  contextTokens?: number
  /** True when contextTokens is a character-based estimate because the provider reported no input usage. */
  contextTokensEstimated?: boolean
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

export type ToolApprovalData = {
  approvalId: string
  toolCallId: string
  toolName: string
  title: string
  summary: string
  target?: {
    type?: string
    id?: string
    name?: string
  } | null
  details?: Array<{
    label?: string
    value: string
    format?: "text" | "datetime"
    tone?: "default" | "destructive"
  }> | null
  presentation?: {
    confirmLabel?: string
    confirmVariant?: "default" | "destructive"
    pendingMessage?: string
    successMessage?: string
    deniedMessage?: string
    failureMessage?: string
  }
}

export type ChatDataParts = {
  compaction: CompactionData
  approval: ToolApprovalData
}

export type ChatUIMessage = UIMessage<ChatMessageMetadata, ChatDataParts>
