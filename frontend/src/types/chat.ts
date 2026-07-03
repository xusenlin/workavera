// Chat domain types — mirror the backend GORM models.

export type ConversationStatus = "active" | "archived" | "deleted"

export type Conversation = {
  id: string
  title: string
  modelId: string
  status: ConversationStatus
  pinned: boolean
  messageCount: number
  toolCallCount: number
  totalTokens: number
  inputTokens: number
  outputTokens: number
  createdAt: string
  updatedAt: string
}

export type MessageRole = "user" | "assistant"

export type MessageStatus = "pending" | "streaming" | "complete" | "error"

export type Message = {
  id: string
  conversationId: string
  role: MessageRole
  modelName: string
  inputTokens: number
  outputTokens: number
  createdAt: string
  updatedAt: string
  status: MessageStatus
  sequenceOrder: number
  blocks: MessageBlock[]
}

export const BlockType = {
  Text: "text",
  Thinking: "thinking",
  ToolUse: "tool_use",
  ToolResult: "tool_result",
} as const

export type BlockTypeValue = (typeof BlockType)[keyof typeof BlockType]

export type MessageBlock = {
  id: string
  messageId: string
  blockType: BlockTypeValue
  sequenceOrder: number
  content: string
  toolUseId: string
  toolName: string
  toolInput: string
  toolResult: string
  isError: boolean
  createdAt: string
  updatedAt: string
}
