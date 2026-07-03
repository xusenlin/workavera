import { useMemo } from "react"

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
import { cn } from "@/lib/utils"
import { formatRelativeTime } from "@/lib/chat-utils"
import { BlockType, type Message as ChatMessage } from "@/types/chat"

/** Parse a JSON string safely, returning the raw string on failure. */
function tryParseJson(value: string): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

/**
 * Pairs a `tool_use` block with its corresponding `tool_result` block (matched
 * by `toolUseId`) and renders them inside a single collapsible Tool.
 */
function ToolBlockPair({
  toolUseBlock,
  resultBlock,
}: {
  toolUseBlock: ChatMessage["blocks"][number]
  resultBlock?: ChatMessage["blocks"][number]
}) {
  const input = useMemo(
    () => tryParseJson(toolUseBlock.toolInput) as Record<string, unknown> | null,
    [toolUseBlock.toolInput]
  )

  const output = resultBlock
    ? (tryParseJson(resultBlock.toolResult) as Record<string, unknown> | string | null)
    : null

  const isError = resultBlock?.isError ?? false
  const state = resultBlock
    ? isError
      ? ("output-error" as const)
      : ("output-available" as const)
    : ("input-available" as const)

  return (
    <Tool defaultOpen={isError}>
      <ToolHeader
        type={`tool-${toolUseBlock.toolName}` as `tool-${string}`}
        state={state}
      />
      <ToolContent>
        {input && <ToolInput input={input} />}
        {resultBlock && (
          <ToolOutput
            output={output as React.ReactNode}
            errorText={isError ? String(output ?? "Tool execution failed") : undefined}
          />
        )}
      </ToolContent>
    </Tool>
  )
}

/**
 * Renders all blocks for a single message, pairing tool_use ↔ tool_result
 * blocks and rendering text / thinking blocks inline.
 */
function MessageBlocks({ message }: { message: ChatMessage }) {
  // Walk blocks in order; when we hit a tool_use, look ahead for its result.
  const rendered: React.ReactNode[] = []
  const consumedResultIds = new Set<string>()

  message.blocks.forEach((block, index) => {
    switch (block.blockType) {
      case BlockType.Text:
        rendered.push(
          <MessageResponse key={`text-${index}`}>
            {block.content}
          </MessageResponse>
        )
        break

      case BlockType.Thinking:
        rendered.push(
          <Reasoning
            key={`thinking-${index}`}
            isStreaming={message.status === "streaming"}
          >
            <ReasoningTrigger />
            <ReasoningContent>{block.content}</ReasoningContent>
          </Reasoning>
        )
        break

      case BlockType.ToolUse: {
        // Find the matching tool_result by toolUseId
        const resultBlock = message.blocks.find(
          (b) =>
            b.blockType === BlockType.ToolResult &&
            b.toolUseId === block.toolUseId &&
            !consumedResultIds.has(b.id)
        )
        if (resultBlock) consumedResultIds.add(resultBlock.id)

        rendered.push(
          <ToolBlockPair
            key={`tool-${index}`}
            toolUseBlock={block}
            resultBlock={resultBlock}
          />
        )
        break
      }

      case BlockType.ToolResult:
        // Skip — already rendered paired with its tool_use above.
        // Render standalone only if it was orphaned (no matching tool_use).
        if (consumedResultIds.has(block.id)) break
        rendered.push(
          <Tool key={`result-orphan-${index}`} defaultOpen>
            <ToolHeader
              type="tool-unknown"
              state={block.isError ? "output-error" : "output-available"}
            />
            <ToolContent>
              <ToolOutput
                output={tryParseJson(block.toolResult) as React.ReactNode}
                errorText={
                  block.isError ? block.toolResult : undefined
                }
              />
            </ToolContent>
          </Tool>
        )
        break
    }
  })

  return <>{rendered}</>
}

export function ChatMessageItem({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"

  return (
    <Message from={message.role}>
      {/* Role + model label */}
      <div
        className={cn(
          "flex items-center gap-2 text-xs text-muted-foreground",
          isUser && "ml-auto justify-end"
        )}
      >
        <span className="font-medium">
          {isUser ? "You" : "Assistant"}
        </span>
        {!isUser && message.modelName && (
          <>
            <span className="text-muted-foreground/50">·</span>
            <span className="text-muted-foreground">{message.modelName}</span>
          </>
        )}
        <span className="text-muted-foreground/50">·</span>
        <span>{formatRelativeTime(message.createdAt)}</span>
        {message.status === "streaming" && (
          <Badge variant="secondary" className="h-4 px-1 text-[10px]">
            streaming
          </Badge>
        )}
      </div>

      <MessageContent>
        <MessageBlocks message={message} />
      </MessageContent>

      {/* Token usage for assistant messages */}
      {!isUser && (message.inputTokens > 0 || message.outputTokens > 0) && (
        <div className="text-muted-foreground/70 flex items-center gap-2 text-[11px]">
          {message.inputTokens > 0 && (
            <span>↑ {message.inputTokens} in</span>
          )}
          {message.outputTokens > 0 && (
            <span>↓ {message.outputTokens} out</span>
          )}
        </div>
      )}
    </Message>
  )
}

