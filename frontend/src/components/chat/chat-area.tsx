import { useEffect } from "react"

import { Chat01Icon, SparklesIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useChat } from "@ai-sdk/react"

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import { Button } from "@/components/ui/button"
import { useChatRuntime } from "@/lib/chat-runtime"
import { useChatStore } from "@/store/chat"
import type {
  ChatUIMessage,
  Conversation as ChatConversation,
} from "@/types/chat"

import { ChatHeader } from "./chat-header"
import { ChatMessageItem } from "./chat-message"
import { ChatPromptInput, type ChatContextInfo } from "./chat-prompt-input"

/**
 * Derives the current context-window occupancy from the newest assistant
 * message that reported usage, falling back to the conversation's persisted
 * snapshot (e.g. while history is still hydrating).
 */
function deriveContextInfo(
  messages: ChatUIMessage[],
  conversation: ChatConversation
): ChatContextInfo {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.role !== "assistant") continue
    const metadata = message.metadata
    if (!metadata?.usage && metadata?.contextTokens === undefined) continue
    const usage = metadata.usage
    return {
      usedTokens:
        metadata.contextTokens ??
        (usage ? usage.inputTokens + usage.outputTokens : 0),
      usage,
    }
  }
  return { usedTokens: conversation.context_tokens ?? 0 }
}

function ChatEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <HugeiconsIcon icon={Chat01Icon} strokeWidth={2} className="size-6" />
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <h3 className="text-lg font-semibold tracking-tight">
          Start a conversation
        </h3>
        <p className="text-sm text-muted-foreground">
          Select a conversation from the sidebar, or create a new one to begin
          chatting.
        </p>
      </div>
      <Button onClick={onCreate} className="gap-2">
        <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} className="size-4" />
        New conversation
      </Button>
    </div>
  )
}

function ActiveChat({ conversation }: { conversation: ChatConversation }) {
  const renameConversation = useChatStore((state) => state.renameConversation)
  const { runtime, state: runtimeState } = useChatRuntime(conversation.id)

  const { messages, sendMessage, status, stop, error } = useChat<ChatUIMessage>(
    {
      chat: runtime.chat,
    }
  )

  useEffect(() => {
    void runtime.hydrate()
  }, [runtime])

  const loadingMessages = runtimeState.loading && !runtimeState.hydrated
  const effectiveStatus =
    runtimeState.activeRunId && status === "ready" ? "submitted" : status

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <ChatHeader conversation={conversation} />
      <Conversation>
        <ConversationContent className="w-full px-4 md:px-16 lg:px-24">
          {!loadingMessages && messages.length === 0 ? (
            <ConversationEmptyState
              title="No messages yet"
              description="Send a message below to start the conversation."
            />
          ) : (
            messages.map((message) => (
              <ChatMessageItem key={message.id} message={message} />
            ))
          )}
          {(error || runtimeState.recoveryError) && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <span>{error?.message ?? runtimeState.recoveryError}</span>
              {runtimeState.activeRunId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void runtime.retry()}
                >
                  Retry
                </Button>
              )}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <ChatPromptInput
        conversationId={conversation.id}
        modelConfigId={conversation.model_config}
        disabled={loadingMessages}
        sendMessage={sendMessage}
        status={effectiveStatus}
        stop={stop}
        activeRunId={runtimeState.activeRunId}
        onRunStarted={runtime.setActiveRunId}
        contextInfo={deriveContextInfo(messages, conversation)}
        onMessageSubmitted={(content) => {
          if (conversation.title !== "New conversation") return
          void renameConversation(conversation.id, content.slice(0, 16)).catch(
            () => {}
          )
        }}
      />
    </div>
  )
}

export function ChatArea() {
  const conversations = useChatStore((state) => state.conversations)
  const openedConversation = useChatStore((state) => state.openedConversation)
  const activeConversationId = useChatStore(
    (state) => state.activeConversationId
  )
  const createConversation = useChatStore((state) => state.createConversation)
  const activeConversation =
    conversations.find(
      (conversation) => conversation.id === activeConversationId
    ) ??
    (openedConversation?.id === activeConversationId
      ? openedConversation
      : null)

  if (!activeConversation) {
    return (
      <div className="flex flex-1 flex-col">
        <ChatEmptyState
          onCreate={() => void createConversation().catch(() => {})}
        />
      </div>
    )
  }
  return (
    <ActiveChat key={activeConversation.id} conversation={activeConversation} />
  )
}
