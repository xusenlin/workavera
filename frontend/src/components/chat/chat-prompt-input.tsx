import { useMemo, useRef, useState } from "react"

import type { UseChatHelpers } from "@ai-sdk/react"
import type { ChatStatus } from "ai"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlusSignIcon } from "@hugeicons/core-free-icons"

import {
  Context,
  ContextCacheCreationUsage,
  ContextCacheUsage,
  ContextCompactionThreshold,
  ContextContent,
  ContextContentBody,
  ContextContentHeader,
  ContextTotalsUsage,
  ContextTrigger,
  type ContextUsage,
} from "@/components/ai-elements/context"
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
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
import { AttachmentGroup } from "@/components/ui/attachment"
import { pb } from "@/lib/pocketbase"
import { RESOURCE_ACCEPT, type Resource } from "@/lib/resources"
import { cn } from "@/lib/utils"
import { useLlmSettingsStore } from "@/store/llm-settings"
import type { ChatUIMessage } from "@/types/chat"

import { AttachmentChip, ResourcePickerList } from "./resource-attachments"
import {
  findResourceTrigger,
  useResourceAttachments,
  useResourcePicker,
  type ResourceTrigger,
} from "./use-resource-attachments"

export type ChatContextInfo = {
  usedTokens: number
  usage?: ContextUsage
  /** usedTokens is a character-based estimate (provider reported no usage). */
  estimated?: boolean
  /** Conversation-wide accumulated usage across every run. */
  totals?: {
    inputTokens: number
    outputTokens: number
  }
}

type Props = {
  conversationId: string
  modelConfigId?: string
  disabled?: boolean
  fullscreen?: boolean
  compactPadding?: boolean
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
  fullscreen = false,
  compactPadding = false,
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
  const [text, setText] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const {
    attachments,
    ready,
    full,
    uploading,
    addFiles,
    addResource,
    retry,
    remove,
    clear,
  } = useResourceAttachments()

  // The `#` token right before the caret opens the resource list. Escape
  // dismisses it for that token only, leaving what was typed as plain text.
  const [trigger, setTrigger] = useState<ResourceTrigger | null>(null)
  const [dismissedStart, setDismissedStart] = useState<number | null>(null)
  const updateTrigger = (value: string, caret: number | null) => {
    const next = caret === null ? null : findResourceTrigger(value, caret)
    if (next?.start !== dismissedStart) setDismissedStart(null)
    setTrigger(next && next.start !== dismissedStart ? next : null)
  }

  const selectResource = (resource: Resource) => {
    if (!trigger || full) return
    // The trigger and query select a resource; they are not message text.
    const value = text.slice(0, trigger.start) + text.slice(trigger.end)
    setText(value)
    setTrigger(null)
    addResource(resource)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(trigger.start, trigger.start)
    })
  }
  const picker = useResourcePicker({
    trigger,
    disabled: full,
    onSelect: selectResource,
    onDismiss: () => {
      setDismissedStart(trigger?.start ?? null)
      setTrigger(null)
    },
  })

  const handleSubmit = async (message: PromptInputMessage) => {
    const content = message.text.trim()
    if (
      (!content && ready.length === 0) ||
      uploading ||
      !modelConfigId ||
      status === "submitted" ||
      status === "streaming"
    ) {
      return
    }
    const runId = crypto.randomUUID()
    onRunStarted?.(runId)
    // Attachments always precede the text, the same order the server stores.
    const parts: ChatUIMessage["parts"] = ready.map((attachment) => ({
      type: "data-resource" as const,
      id: attachment.resourceId,
      data: {
        resourceId: attachment.resourceId ?? "",
        name: attachment.name,
        mediaType: attachment.mediaType,
        size: attachment.size,
      },
    }))
    if (content) parts.push({ type: "text", text: content })
    setText("")
    setTrigger(null)
    clear()
    onMessageSubmitted?.(content || ready[0].name)
    await sendMessage(
      { parts },
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
    !disabled &&
    !uploading &&
    (!!text.trim() || ready.length > 0) &&
    !!modelConfigId &&
    models.length > 0
  const selectedModel = models.find((model) => model.id === modelConfigId)

  const inputDisabled = disabled || models.length === 0
  const acceptsFiles = !inputDisabled && !full

  return (
    <div
      className={cn(
        "relative p-3",
        fullscreen
          ? "mx-auto w-full px-4 md:w-[60%] md:px-0"
          : compactPadding
            ? "px-4 md:px-8"
            : "px-4 md:px-16 lg:px-24"
      )}
      // Capture-phase handlers run before PromptInput's own drop listener,
      // which would otherwise keep the file as an inline attachment.
      onDragOverCapture={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return
        event.preventDefault()
        event.stopPropagation()
        setDragging(acceptsFiles)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false)
        }
      }}
      onDropCapture={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return
        event.preventDefault()
        event.stopPropagation()
        setDragging(false)
        if (acceptsFiles) addFiles(Array.from(event.dataTransfer.files))
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={RESOURCE_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ""
          addFiles(files)
        }}
      />
      {picker.open && trigger && (
        <div
          className={cn(
            "absolute bottom-full",
            fullscreen
              ? "inset-x-4 md:inset-x-0"
              : compactPadding
                ? "inset-x-4 md:inset-x-8"
                : "inset-x-4 md:inset-x-16 lg:inset-x-24"
          )}
        >
          <ResourcePickerList
            query={trigger.query}
            results={picker.results}
            loading={picker.loading}
            highlighted={picker.highlighted}
            full={full}
            attachedIds={
              new Set(attachments.map((item) => item.resourceId ?? ""))
            }
            onHighlight={picker.setHighlighted}
            onSelect={selectResource}
          />
        </div>
      )}
      <PromptInput
        onSubmit={handleSubmit}
        className={cn(
          "rounded-xl",
          dragging && "rounded-xl ring-2 ring-primary/40"
        )}
      >
        {attachments.length > 0 && (
          <PromptInputHeader className="px-3 pt-2.5 pb-0">
            <AttachmentGroup className="w-full gap-2">
              {attachments.map((attachment) => (
                <AttachmentChip
                  key={attachment.key}
                  attachment={attachment}
                  onRemove={() => remove(attachment.key)}
                  onRetry={() => retry(attachment.key)}
                />
              ))}
            </AttachmentGroup>
          </PromptInputHeader>
        )}
        <PromptInputBody>
          <PromptInputTextarea
            ref={textareaRef}
            placeholder={
              models.length === 0
                ? "Configure a model to start chatting"
                : "Send a message, or type # to attach a resource..."
            }
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              updateTrigger(event.target.value, event.target.selectionStart)
            }}
            onSelect={(event) =>
              updateTrigger(
                event.currentTarget.value,
                event.currentTarget.selectionStart
              )
            }
            onBlur={() => setTrigger(null)}
            onKeyDown={picker.onKeyDown}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files)
              if (files.length === 0) return
              event.preventDefault()
              if (acceptsFiles) addFiles(files)
            }}
            disabled={inputDisabled}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputButton
              tooltip="Upload a file (or type # to attach an existing resource)"
              aria-label="Upload a file"
              disabled={!acceptsFiles}
              onClick={() => fileInputRef.current?.click()}
            >
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            </PromptInputButton>
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
                estimated={contextInfo.estimated}
                totals={contextInfo.totals}
              >
                <ContextTrigger
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 px-2 text-xs"
                />
                <ContextContent>
                  <ContextContentHeader />
                  <ContextContentBody className="space-y-1">
                    <ContextCacheUsage />
                    <ContextCacheCreationUsage />
                    <ContextCompactionThreshold />
                  </ContextContentBody>
                  <ContextContentBody className="space-y-1">
                    <ContextTotalsUsage />
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
