import { useEffect, useMemo, useRef, useState } from "react"

import type { UseChatHelpers } from "@ai-sdk/react"
import type { ChatStatus } from "ai"

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import { pb } from "@/lib/pocketbase"
import { useLlmSettingsStore } from "@/store/llm-settings"
import type { ChatUIMessage } from "@/types/chat"

type Props = {
  conversationId: string
  disabled?: boolean
  sendMessage: UseChatHelpers<ChatUIMessage>["sendMessage"]
  status: ChatStatus
  stop: UseChatHelpers<ChatUIMessage>["stop"]
}

export function ChatPromptInput({
  conversationId,
  disabled = false,
  sendMessage,
  status,
  stop,
}: Props) {
  const models = useLlmSettingsStore((state) => state.models)
  const defaultModelId = useMemo(
    () => models.find((model) => model.isDefault)?.id ?? "",
    [models]
  )
  const [selectedModelConfigId, setSelectedModelConfigId] = useState<
    string | null
  >(null)
  const modelConfigId = selectedModelConfigId ?? defaultModelId
  const [text, setText] = useState("")
  const activeRunId = useRef<string | null>(null)

  useEffect(() => {
    if (status === "ready" || status === "error") activeRunId.current = null
  }, [status])

  const handleSubmit = async (message: PromptInputMessage) => {
    const content = message.text.trim()
    if (
      !content ||
      !modelConfigId ||
      status === "submitted" ||
      status === "streaming"
    ) {
      return
    }
    const runId = crypto.randomUUID()
    activeRunId.current = runId
    setText("")
    await sendMessage(
      { text: content },
      { body: { runId, conversationId, modelConfigId } }
    )
  }

  const handleStop = async () => {
    const runId = activeRunId.current
    try {
      if (runId) {
        await pb.send(`/api/chat/runs/${runId}/stop`, {
          method: "POST",
          requestKey: null,
        })
      }
    } finally {
      await stop()
    }
  }

  const generating = status === "submitted" || status === "streaming"
  const canSend =
    !disabled && !!text.trim() && !!modelConfigId && models.length > 0

  return (
    <div className="p-3 px-4 md:px-16 lg:px-24">
      <PromptInput onSubmit={handleSubmit} className="rounded-xl">
        <PromptInputBody>
          <PromptInputTextarea
            placeholder={
              models.length === 0
                ? "Configure a model to start chatting"
                : "Send a message..."
            }
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={disabled || models.length === 0}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputSelect
              value={modelConfigId}
              onValueChange={setSelectedModelConfigId}
            >
              <PromptInputSelectTrigger disabled={models.length === 0}>
                <PromptInputSelectValue placeholder="Select model" />
              </PromptInputSelectTrigger>
              <PromptInputSelectContent>
                {models.map((model) => (
                  <PromptInputSelectItem key={model.id} value={model.id}>
                    {model.name}
                  </PromptInputSelectItem>
                ))}
              </PromptInputSelectContent>
            </PromptInputSelect>
          </PromptInputTools>
          <PromptInputSubmit
            disabled={!generating && !canSend}
            status={status}
            onStop={() => void handleStop()}
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}
