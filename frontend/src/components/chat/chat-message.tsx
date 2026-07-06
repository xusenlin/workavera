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
        if (part.toolName === "get_contacts") {
          return <ContactsToolCard key={part.toolCallId} part={part} />
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
