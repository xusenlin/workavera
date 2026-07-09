import { useEffect, useMemo, useRef, useState } from "react"

import { Chat01Icon, SparklesIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import { Button } from "@/components/ui/button"
import { pb } from "@/lib/pocketbase"
import { useChatStore } from "@/store/chat"
import type {
  ChatUIMessage,
  Conversation as ChatConversation,
} from "@/types/chat"

import { ChatHeader } from "./chat-header"
import { ChatMessageItem } from "./chat-message"
import { ChatPromptInput } from "./chat-prompt-input"

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
  const refreshConversations = useChatStore((state) => state.refresh)
  const renameConversation = useChatStore((state) => state.renameConversation)
  const [loadingMessages, setLoadingMessages] = useState(true)
  const pendingTitleRef = useRef<string | null>(null)

  const transport = useMemo(
    () =>
      new DefaultChatTransport<ChatUIMessage>({
        api: `${pb.baseURL}/api/chat/stream`,
        headers: () => ({ Authorization: pb.authStore.token }),
        prepareSendMessagesRequest: ({ messages, body, headers }) => ({
          headers,
          body: {
            ...body,
            message: messages.at(-1),
          },
        }),
      }),
    []
  )

  const { messages, setMessages, sendMessage, status, stop, error } =
    useChat<ChatUIMessage>({
      id: conversation.id,
      transport,
      onFinish: async () => {
        const pendingTitle = pendingTitleRef.current
        pendingTitleRef.current = null
        if (conversation.title === "New conversation" && pendingTitle) {
          await renameConversation(conversation.id, pendingTitle).catch(
            () => {}
          )
        }
        void refreshConversations()
      },
    })

  useEffect(() => {
    let active = true
    void pb
      .send<ChatUIMessage[]>(
        `/api/chat/conversations/${conversation.id}/messages`,
        { method: "GET", requestKey: null }
      )
      .then((loaded) => {
        if (active) setMessages(loaded)
      })
      .finally(() => {
        if (active) setLoadingMessages(false)
      })
    return () => {
      active = false
    }
  }, [conversation.id, setMessages])

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
          {error && <p className="text-sm text-destructive">{error.message}</p>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <ChatPromptInput
        conversationId={conversation.id}
        modelConfigId={conversation.model_config}
        disabled={loadingMessages}
        sendMessage={sendMessage}
        status={status}
        stop={stop}
        onMessageSubmitted={(content) => {
          if (conversation.title !== "New conversation") return
          pendingTitleRef.current = content.slice(0, 16)
        }}
      />
    </div>
  )
}

export function ChatArea() {
  const conversations = useChatStore((state) => state.conversations)
  const activeConversationId = useChatStore(
    (state) => state.activeConversationId
  )
  const createConversation = useChatStore((state) => state.createConversation)
  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId
  )

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
