import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
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
import type { ChatUIMessage } from "@/types/chat"

import { ContactsToolCard } from "./contacts-tool-output"
import { BoardProjectsToolCard } from "./board-projects-tool-output"
import { BoardProjectDetailToolCard } from "./board-project-detail-tool-output"
import { BoardTemplatesToolCard } from "./board-templates-tool-output"
import { BoardMutationToolCard } from "./board-mutation-tool-output"
import { TasksToolCard } from "./tasks-tool-output"
import { AIMicroAppsToolCard } from "./ai-micro-apps-tool-output"
import {
  ReadingSearchToolCard,
  ReadingItemToolCard,
} from "./reading-tool-output"
import { DocsSearchToolCard, DocsItemToolCard } from "./docs-tool-output"
import {
  CalendarScheduleToolCard,
  CalendarMutationToolCard,
} from "./calendar-tool-output"

const aiMicroAppToolNames = new Set([
  "microapps_create",
  "microapps_update",
  "microapps_get",
  "microapps_list",
  "microapps_search",
  "microapps_replace",
  "microapps_write_chunk",
])

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

const docItemToolNames = new Set(["docs_get", "docs_upsert", "docs_replace"])

const calendarMutationToolNames = new Set([
  "calendar_create_event",
  "calendar_update_event",
])

function MessageParts({ message }: { message: ChatUIMessage }) {
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
        if (part.toolName === "contacts_search") {
          return <ContactsToolCard key={part.toolCallId} part={part} />
        }
        if (part.toolName === "board_search_projects") {
          return <BoardProjectsToolCard key={part.toolCallId} part={part} />
        }
        if (part.toolName === "board_get_project") {
          return (
            <BoardProjectDetailToolCard key={part.toolCallId} part={part} />
          )
        }
        if (part.toolName === "board_search_tasks") {
          return <TasksToolCard key={part.toolCallId} part={part} />
        }
        if (part.toolName === "board_list_templates") {
          return <BoardTemplatesToolCard key={part.toolCallId} part={part} />
        }
        if (boardMutationToolNames.has(part.toolName)) {
          return <BoardMutationToolCard key={part.toolCallId} part={part} />
        }
        if (aiMicroAppToolNames.has(part.toolName)) {
          return <AIMicroAppsToolCard key={part.toolCallId} part={part} />
        }
        if (part.toolName === "reading_search") {
          return <ReadingSearchToolCard key={part.toolCallId} part={part} />
        }
        if (readingItemToolNames.has(part.toolName)) {
          return <ReadingItemToolCard key={part.toolCallId} part={part} />
        }
        if (part.toolName === "docs_search") {
          return <DocsSearchToolCard key={part.toolCallId} part={part} />
        }
        if (docItemToolNames.has(part.toolName)) {
          return <DocsItemToolCard key={part.toolCallId} part={part} />
        }
        if (part.toolName === "calendar_get_schedule") {
          return <CalendarScheduleToolCard key={part.toolCallId} part={part} />
        }
        if (calendarMutationToolNames.has(part.toolName)) {
          return <CalendarMutationToolCard key={part.toolCallId} part={part} />
        }
        return (
          <Tool
            key={part.toolCallId}
            defaultOpen={part.state === "output-error"}
          >
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
                  output={
                    part.state === "output-available" ? part.output : undefined
                  }
                  errorText={
                    part.state === "output-error" ? part.errorText : undefined
                  }
                />
              )}
            </ToolContent>
          </Tool>
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
      default:
        return null
    }
  })
}

export function ChatMessageItem({ message }: { message: ChatUIMessage }) {
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
        <MessageParts message={message} />
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
