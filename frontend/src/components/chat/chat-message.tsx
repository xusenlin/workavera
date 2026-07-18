import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import { memo } from "react"
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning"
import { Shimmer } from "@/components/ai-elements/shimmer"
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool"
import { Badge } from "@/components/ui/badge"
import { formatRelativeTime } from "@/lib/chat-utils"
import { cn } from "@/lib/utils"
import type {
  ChatMessageMetadata,
  ChatUIMessage,
  ToolApprovalData,
} from "@/types/chat"

import { ContactsToolCard } from "./contacts-tool-output"
import { BoardProjectsToolCard } from "./board-projects-tool-output"
import { BoardProjectDetailToolCard } from "./board-project-detail-tool-output"
import { BoardTemplatesToolCard } from "./board-templates-tool-output"
import { BoardMutationToolCard } from "./board-mutation-tool-output"
import { TasksToolCard } from "./tasks-tool-output"
import {
  ReadingSearchToolCard,
  ReadingItemToolCard,
} from "./reading-tool-output"
import { DocsSearchToolCard, DocsItemToolCard } from "./docs-tool-output"
import {
  CalendarScheduleToolCard,
  CalendarMutationToolCard,
} from "./calendar-tool-output"
import { ApprovalToolCard } from "./approval-tool-card"
import { MemoryToolCard } from "./memory-tool-output"

const boardMutationToolNames = new Set([
  "board_create_project",
  "board_update_project",
  "board_upsert_state",
  "board_upsert_label",
  "board_upsert_member",
  "board_create_task",
  "board_update_task",
])

const readingItemToolNames = new Set([
  "reading_upsert",
  "reading_get",
  "reading_summarize",
])

const docItemToolNames = new Set([
  "docs_get",
  "docs_upsert",
  "docs_move",
  "docs_replace",
  "docs_write_chunk",
])

const calendarMutationToolNames = new Set([
  "calendar_create_event",
  "calendar_update_event",
])

type DynamicToolPart = Extract<
  ChatUIMessage["parts"][number],
  { type: "dynamic-tool" }
>

type ToolCardProps = {
  part: DynamicToolPart
  approval?: ToolApprovalData
  messageId: string
  messageStatus?: ChatMessageMetadata["status"]
  runId?: string
  runActive: boolean
}

function sameApproval(
  previous?: ToolApprovalData,
  next?: ToolApprovalData
): boolean {
  if (previous === next) return true
  if (!previous || !next) return false
  if (
    previous.approvalId !== next.approvalId ||
    previous.toolCallId !== next.toolCallId ||
    previous.toolName !== next.toolName ||
    previous.title !== next.title ||
    previous.summary !== next.summary ||
    previous.target?.type !== next.target?.type ||
    previous.target?.id !== next.target?.id ||
    previous.target?.name !== next.target?.name ||
    previous.presentation?.confirmLabel !== next.presentation?.confirmLabel ||
    previous.presentation?.confirmVariant !==
      next.presentation?.confirmVariant ||
    previous.presentation?.pendingMessage !==
      next.presentation?.pendingMessage ||
    previous.presentation?.successMessage !==
      next.presentation?.successMessage ||
    previous.presentation?.deniedMessage !== next.presentation?.deniedMessage ||
    previous.presentation?.failureMessage !== next.presentation?.failureMessage
  ) {
    return false
  }

  const previousDetails = previous.details ?? []
  const nextDetails = next.details ?? []
  return (
    previousDetails.length === nextDetails.length &&
    previousDetails.every((detail, index) => {
      const nextDetail = nextDetails[index]
      return (
        detail.label === nextDetail.label &&
        detail.value === nextDetail.value &&
        detail.format === nextDetail.format &&
        detail.tone === nextDetail.tone
      )
    })
  )
}

function ToolCard({
  part,
  approval,
  messageId,
  messageStatus,
  runId,
  runActive,
}: ToolCardProps) {
  if (approval) {
    return (
      <ApprovalToolCard
        part={part}
        approval={approval}
        runId={runId}
        runActive={runActive}
        messageStatus={messageStatus}
      />
    )
  }
  if (part.toolName === "contacts_search") {
    return <ContactsToolCard part={part} />
  }
  if (part.toolName === "board_search_projects") {
    return <BoardProjectsToolCard part={part} />
  }
  if (part.toolName === "board_get_project") {
    return <BoardProjectDetailToolCard part={part} />
  }
  if (part.toolName === "board_search_tasks") {
    return <TasksToolCard part={part} />
  }
  if (part.toolName === "board_list_templates") {
    return <BoardTemplatesToolCard part={part} />
  }
  if (boardMutationToolNames.has(part.toolName)) {
    return <BoardMutationToolCard part={part} />
  }
  if (part.toolName === "reading_search") {
    return <ReadingSearchToolCard part={part} />
  }
  if (readingItemToolNames.has(part.toolName)) {
    return <ReadingItemToolCard part={part} />
  }
  if (part.toolName === "docs_search") {
    return <DocsSearchToolCard part={part} />
  }
  if (docItemToolNames.has(part.toolName)) {
    return <DocsItemToolCard part={part} />
  }
  if (part.toolName === "calendar_get_schedule") {
    return <CalendarScheduleToolCard part={part} />
  }
  if (calendarMutationToolNames.has(part.toolName)) {
    return <CalendarMutationToolCard part={part} />
  }
  if (
    part.toolName === "system_memory_upsert" ||
    part.toolName === "system_memory_forget"
  ) {
    return (
      <MemoryToolCard part={part} messageId={messageId} runActive={runActive} />
    )
  }
  return (
    <Tool defaultOpen={false}>
      <ToolHeader
        type="dynamic-tool"
        toolName={part.toolName}
        state={part.state}
      />
      <ToolContent>
        {part.input !== undefined && <ToolInput input={part.input} />}
        {(part.state === "output-available" ||
          part.state === "output-error") && (
          <ToolOutput
            output={part.state === "output-available" ? part.output : undefined}
            errorText={
              part.state === "output-error" ? part.errorText : undefined
            }
          />
        )}
      </ToolContent>
    </Tool>
  )
}

const MemoizedToolCard = memo(ToolCard, (previous, next) => {
  if (
    previous.messageId !== next.messageId ||
    previous.messageStatus !== next.messageStatus ||
    previous.runId !== next.runId ||
    previous.runActive !== next.runActive ||
    !sameApproval(previous.approval, next.approval) ||
    previous.part.toolCallId !== next.part.toolCallId ||
    previous.part.toolName !== next.part.toolName ||
    previous.part.state !== next.part.state
  ) {
    return false
  }

  if (previous.part === next.part) return true

  // The AI SDK deep-clones the current message on every stream chunk. Tool
  // parts in a settled protocol state are immutable, so keep their rendered
  // card until the state or surrounding run metadata actually changes.
  return (
    next.part.state !== "input-streaming" &&
    !("preliminary" in next.part && next.part.preliminary === true)
  )
})

MemoizedToolCard.displayName = "MemoizedToolCard"

function MessageParts({
  message,
  runActive,
}: {
  message: ChatUIMessage
  runActive: boolean
}) {
  const approvals = new Map(
    message.parts
      .filter((part) => part.type === "data-approval")
      .map((part) => [part.data.toolCallId, part.data])
  )

  return message.parts.map((part, index) => {
    switch (part.type) {
      case "text":
        return (
          <MessageResponse
            key={`text-${index}`}
            isAnimating={part.state === "streaming"}
          >
            {part.text}
          </MessageResponse>
        )
      case "reasoning":
        return (
          <Reasoning
            key={`reasoning-${index}`}
            isStreaming={part.state === "streaming"}
          >
            <ReasoningTrigger />
            <ReasoningContent>{part.text}</ReasoningContent>
          </Reasoning>
        )
      case "dynamic-tool":
        return (
          <MemoizedToolCard
            key={part.toolCallId}
            part={part}
            approval={approvals.get(part.toolCallId)}
            messageId={message.id}
            messageStatus={message.metadata?.status}
            runId={message.metadata?.runId}
            runActive={runActive}
          />
        )
      case "source-url":
        return (
          <a
            key={`${part.sourceId}-${index}`}
            href={part.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground underline underline-offset-4"
          >
            {part.title || part.url}
          </a>
        )
      case "data-compaction":
        if (part.data.state === "started") {
          return (
            <Shimmer key={`compaction-${index}`} className="text-xs">
              Compacting context…
            </Shimmer>
          )
        }
        return (
          <div
            key={`compaction-${index}`}
            className="text-xs text-muted-foreground/70"
          >
            {part.data.state === "failed"
              ? "Context compaction failed — continued with full history"
              : "Older messages were compacted into a summary"}
          </div>
        )
      case "data-approval":
        return null
      default:
        return null
    }
  })
}

function ChatMessageItemComponent({
  message,
  runActive,
}: {
  message: ChatUIMessage
  runActive: boolean
}) {
  const isUser = message.role === "user"
  const metadata = message.metadata
  const createdAt = metadata?.createdAt
  const usage = metadata?.usage

  return (
    <Message from={message.role}>
      <div
        className={cn(
          "flex items-center gap-2 text-xs text-muted-foreground",
          isUser && "ml-auto justify-end"
        )}
      >
        <span className="font-medium">{isUser ? "You" : "Assistant"}</span>
        {!isUser && metadata?.model?.name && (
          <>
            <span className="text-muted-foreground/50">·</span>
            <span>{metadata.model.name}</span>
          </>
        )}
        {createdAt && (
          <>
            <span className="text-muted-foreground/50">·</span>
            <span>{formatRelativeTime(createdAt)}</span>
          </>
        )}
        {(metadata?.status === "streaming" ||
          message.parts.some((part) =>
            "state" in part ? part.state === "streaming" : false
          )) && (
          <Badge variant="secondary" className="h-4 px-1 text-[10px]">
            streaming
          </Badge>
        )}
      </div>

      <MessageContent>
        <MessageParts message={message} runActive={runActive} />
      </MessageContent>

      {!isUser &&
        usage &&
        (usage.inputTokens > 0 || usage.outputTokens > 0) && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
            {usage.inputTokens > 0 && <span>↑ {usage.inputTokens} in</span>}
            {usage.outputTokens > 0 && <span>↓ {usage.outputTokens} out</span>}
          </div>
        )}
    </Message>
  )
}

export const ChatMessageItem = memo(ChatMessageItemComponent)

ChatMessageItem.displayName = "ChatMessageItem"
