import { useEffect, useMemo, useState } from "react"

import type { UseChatHelpers } from "@ai-sdk/react"
import type { ChatStatus } from "ai"

import {
  Context,
  ContextCacheCreationUsage,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
  type ContextUsage,
} from "@/components/ai-elements/context"
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

export type ChatContextInfo = {
  usedTokens: number
  usage?: ContextUsage
}

type Props = {
  conversationId: string
  modelConfigId?: string
  disabled?: boolean
  sendMessage: UseChatHelpers<ChatUIMessage>["sendMessage"]
  status: ChatStatus
  stop: UseChatHelpers<ChatUIMessage>["stop"]
  onMessageSubmitted?: (content: string) => void
  activeRunId?: string | null
  onRunStarted?: (runId: string) => void
  contextInfo?: ChatContextInfo
}

export function ChatPromptInput({
  conversationId,
  modelConfigId: initialModelConfigId,
  disabled = false,
  sendMessage,
  status,
  stop,
  onMessageSubmitted,
  activeRunId,
  onRunStarted,
  contextInfo,
}: Props) {
  const models = useLlmSettingsStore((state) => state.models)
  const defaultModelId = useMemo(
    () => models.find((model) => model.isDefault)?.id ?? "",
    [models]
  )
  const [selectedModelConfigId, setSelectedModelConfigId] = useState<
    string | null
  >(initialModelConfigId || null)
  const modelConfigId = selectedModelConfigId ?? defaultModelId
  const [text, setText] = useState(() => {
    const appId = sessionStorage.getItem("aiMicroAppEditId")
    if (!appId) return ""
    sessionStorage.removeItem("aiMicroAppEditId")
    return `Edit AI micro app ${appId}: `
  })
  useEffect(() => {
    function handleMicroAppEdit(event: Event) {
      const appId = (event as CustomEvent<string>).detail
      if (appId) setText(`Edit AI micro app ${appId}: `)
    }
    window.addEventListener("ai-micro-app-edit", handleMicroAppEdit)
    return () =>
      window.removeEventListener("ai-micro-app-edit", handleMicroAppEdit)
  }, [])

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
    onRunStarted?.(runId)
    setText("")
    onMessageSubmitted?.(content)
    await sendMessage(
      { text: content },
      { body: { runId, conversationId, modelConfigId } }
    )
  }

  const handleStop = async () => {
    try {
      if (activeRunId) {
        await pb.send(`/api/chat/runs/${activeRunId}/stop`, {
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
  const selectedModel = models.find((model) => model.id === modelConfigId)

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
            {selectedModel && contextInfo && (
              <Context
                maxTokens={selectedModel.maxContextTokens}
                usedTokens={contextInfo.usedTokens}
                usage={contextInfo.usage}
              >
                <ContextTrigger
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 px-2 text-xs"
                />
                <ContextContent>
                  <ContextContentHeader />
                  <ContextContentBody className="space-y-1">
                    <ContextInputUsage />
                    <ContextOutputUsage />
                    <ContextReasoningUsage />
                    <ContextCacheUsage />
                    <ContextCacheCreationUsage />
                  </ContextContentBody>
                </ContextContent>
              </Context>
            )}
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
