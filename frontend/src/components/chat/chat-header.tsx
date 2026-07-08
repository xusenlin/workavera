import { useEffect, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Archive02Icon,
  InformationCircleIcon,
  Pin02Icon,
} from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  const renameConversation = useChatStore((s) => s.renameConversation)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(conversation.title)
  const [savingTitle, setSavingTitle] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const ignoreBlurRef = useRef(false)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commitRename = async () => {
    if (savingTitle) return
    const trimmed = title.trim()
    if (!trimmed || trimmed === conversation.title) {
      setTitle(conversation.title)
      setEditing(false)
      return
    }

    setSavingTitle(true)
    try {
      await renameConversation(conversation.id, trimmed)
      setEditing(false)
    } catch {
      setTitle(conversation.title)
    } finally {
      setSavingTitle(false)
    }
  }

  const cancelRename = () => {
    ignoreBlurRef.current = true
    setTitle(conversation.title)
    setEditing(false)
  }

  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {editing ? (
          <Input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={savingTitle}
            onBlur={() => {
              if (ignoreBlurRef.current) {
                ignoreBlurRef.current = false
                return
              }
              void commitRename()
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                e.currentTarget.blur()
              }
              if (e.key === "Escape") {
                e.preventDefault()
                cancelRename()
              }
            }}
            className="h-7 max-w-64 text-sm font-semibold"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setTitle(conversation.title)
              setEditing(true)
            }}
            className="min-w-0 truncate text-left text-sm font-semibold hover:text-muted-foreground"
            title="Click to rename"
          >
            {conversation.title}
          </button>
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
              {conversation.message_count}
              <span className="hidden text-muted-foreground md:inline">
                messages
              </span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <div className="flex flex-col gap-0.5 text-xs">
              <span>{conversation.message_count} messages</span>
              <span>{conversation.tool_call_count} tool calls</span>
              <span>
                {formatTokenCount(conversation.input_tokens)} in /{" "}
                {formatTokenCount(conversation.output_tokens)} out tokens
              </span>
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void togglePin(conversation.id)}
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
            onClick={() => void archiveConversation(conversation.id).catch(() => {})}
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
