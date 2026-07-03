import { HugeiconsIcon } from "@hugeicons/react"
import { Chat01Icon, SparklesIcon } from "@hugeicons/core-free-icons"

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import { Button } from "@/components/ui/button"
import { useChatStore } from "@/store/chat"

import { ChatHeader } from "./chat-header"
import { ChatPromptInput } from "./chat-prompt-input"
import { ChatMessageItem } from "./chat-message"

function ChatEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <div className="bg-primary text-primary-foreground flex size-12 items-center justify-center rounded-xl">
        <HugeiconsIcon icon={Chat01Icon} strokeWidth={2} className="size-6" />
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <h3 className="text-lg font-semibold tracking-tight">
          Start a conversation
        </h3>
        <p className="text-muted-foreground text-sm">
          Select a conversation from the sidebar, or create a new one to begin
          chatting with your assistant.
        </p>
      </div>
      <Button onClick={onCreate} className="gap-2">
        <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} className="size-4" />
        New conversation
      </Button>
    </div>
  )
}

export function ChatArea() {
  const conversations = useChatStore((s) => s.conversations)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const messagesByConversation = useChatStore((s) => s.messagesByConversation)
  const createConversation = useChatStore((s) => s.createConversation)

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  )

  if (!activeConversation) {
    return (
      <div className="flex flex-1 flex-col">
        <ChatEmptyState onCreate={createConversation} />
      </div>
    )
  }

  const messages = messagesByConversation[activeConversation.id] ?? []

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <ChatHeader conversation={activeConversation} />

      <Conversation>
        <ConversationContent className="w-full px-4 md:px-16 lg:px-24">
          {messages.length === 0 ? (
            <ConversationEmptyState
              title="No messages yet"
              description="Send a message below to start the conversation."
            />
          ) : (
            messages.map((message) => (
              <ChatMessageItem key={message.id} message={message} />
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <ChatPromptInput conversationId={activeConversation.id} />
    </div>
  )
}
