import { useState } from "react"

import {
  PromptInput,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputBody,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSelect,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSelectContent,
  PromptInputSelectItem,
} from "@/components/ai-elements/prompt-input"
import { CHAT_MODELS } from "@/lib/chat-utils"
import { useChatStore } from "@/store/chat"
import { BlockType } from "@/types/chat"

export function ChatPromptInput({
  conversationId,
}: {
  conversationId: string
}) {
  const addMessage = useChatStore((s) => s.addMessage)
  const setConversationModel = useChatStore((s) => s.setConversationModel)
  const modelId = useChatStore(
    (s) => s.conversations.find((c) => c.id === conversationId)?.modelId ?? ""
  )
  const [text, setText] = useState("")

  const handleSubmit = (message: PromptInputMessage) => {
    const content = message.text.trim()
    if (!content) return

    // Add the user message
    addMessage(conversationId, "user", [
      {
        blockType: BlockType.Text,
        content,
        toolUseId: "",
        toolName: "",
        toolInput: "",
        toolResult: "",
        isError: false,
      },
    ])

    // Simulate an assistant response acknowledging the message
    addMessage(conversationId, "assistant", [
      {
        blockType: BlockType.Thinking,
        content:
          "The user sent a message. In a real implementation, this would stream a response from the configured LLM model. For now, this is a simulated reply to demonstrate the chat UI.",
        toolUseId: "",
        toolName: "",
        toolInput: "",
        toolResult: "",
        isError: false,
      },
      {
        blockType: BlockType.Text,
        content: `I received your message: "${content}". This is a simulated response — connect a backend API to enable real AI-powered replies.`,
        toolUseId: "",
        toolName: "",
        toolInput: "",
        toolResult: "",
        isError: false,
      },
    ])

    setText("")
  }

  return (
    <div className="p-3 px-4 md:px-16 lg:px-24">
      <PromptInput onSubmit={handleSubmit} className="rounded-xl">
        <PromptInputBody>
          <PromptInputTextarea
            placeholder="Send a message..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputSelect
              value={modelId}
              onValueChange={(value) => setConversationModel(conversationId, value)}
            >
              <PromptInputSelectTrigger>
                <PromptInputSelectValue placeholder="Select model" />
              </PromptInputSelectTrigger>
              <PromptInputSelectContent>
                {CHAT_MODELS.map((model) => (
                  <PromptInputSelectItem key={model.id} value={model.id}>
                    {model.name}
                  </PromptInputSelectItem>
                ))}
              </PromptInputSelectContent>
            </PromptInputSelect>
          </PromptInputTools>
          <PromptInputSubmit disabled={!text.trim()} status="ready" />
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}
