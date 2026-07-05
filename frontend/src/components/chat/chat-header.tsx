import { HugeiconsIcon } from "@hugeicons/react"
import {
  Archive02Icon,
  InformationCircleIcon,
  Pin02Icon,
} from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatTokenCount } from "@/lib/chat-utils"
import { useChatStore } from "@/store/chat"
import type { Conversation } from "@/types/chat"

export function ChatHeader({ conversation }: { conversation: Conversation }) {
  const togglePin = useChatStore((s) => s.togglePin)
  const archiveConversation = useChatStore((s) => s.archiveConversation)

  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm font-semibold">
          {conversation.title}
        </span>
        {conversation.pinned && (
          <HugeiconsIcon
            icon={Pin02Icon}
            strokeWidth={2}
            className="size-3.5 shrink-0 text-muted-foreground"
          />
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="secondary"
              className="hidden cursor-default gap-1 sm:flex"
            >
              <span className="text-muted-foreground">ID</span>
              <code className="text-[11px] text-foreground">
                {conversation.id.slice(-8)}
              </code>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">Conversation ID: {conversation.id}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="cursor-default gap-1">
              <HugeiconsIcon
                icon={InformationCircleIcon}
                strokeWidth={2}
                className="size-3"
              />
              {conversation.messageCount}
              <span className="hidden text-muted-foreground md:inline">
                messages
              </span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <div className="flex flex-col gap-0.5 text-xs">
              <span>{conversation.messageCount} messages</span>
              <span>{conversation.toolCallCount} tool calls</span>
              <span>
                {formatTokenCount(conversation.inputTokens)} in /{" "}
                {formatTokenCount(conversation.outputTokens)} out tokens
              </span>
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => togglePin(conversation.id)}
            aria-label={conversation.pinned ? "Unpin" : "Pin"}
          >
            <HugeiconsIcon
              icon={Pin02Icon}
              strokeWidth={2}
              className={conversation.pinned ? "text-foreground" : ""}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => archiveConversation(conversation.id)}
            disabled={conversation.status === "archived"}
            aria-label="Archive"
          >
            <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} />
          </Button>
        </div>
      </div>
    </div>
  )
}
