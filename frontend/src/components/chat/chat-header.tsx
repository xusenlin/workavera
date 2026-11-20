import { useEffect, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Archive02Icon,
  Maximize01Icon,
  Minimize01Icon,
  Pin02Icon,
  SidebarRightIcon,
} from "@hugeicons/core-free-icons"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/store/chat"
import type { Conversation } from "@/types/chat"

export function ChatHeader({
  conversation,
  sidePanelOpen,
  onToggleSidePanel,
  fullscreen,
  onToggleFullscreen,
}: {
  conversation: Conversation
  sidePanelOpen: boolean
  onToggleSidePanel: () => void
  fullscreen: boolean
  onToggleFullscreen: () => void
}) {
  const togglePin = useChatStore((s) => s.togglePin)
  const archiveConversation = useChatStore((s) => s.archiveConversation)
  const renameConversation = useChatStore((s) => s.renameConversation)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(conversation.title)
  const [savingTitle, setSavingTitle] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [archiving, setArchiving] = useState(false)
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

  const handleArchive = async () => {
    if (archiving) return
    setArchiving(true)
    try {
      await archiveConversation(conversation.id)
      setConfirmArchive(false)
    } catch {
      // The store reports the error toast.
    } finally {
      setArchiving(false)
    }
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

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
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
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {conversation.pinned ? "Unpin" : "Pin"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setConfirmArchive(true)}
                disabled={conversation.status === "archived"}
                aria-label="Archive"
              >
                <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Archive</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onToggleSidePanel}
                aria-label={sidePanelOpen ? "Hide panel" : "Show panel"}
                aria-pressed={sidePanelOpen}
                className={cn(sidePanelOpen && "bg-muted text-foreground")}
              >
                <HugeiconsIcon icon={SidebarRightIcon} strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {sidePanelOpen ? "Hide panel" : "Show panel"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onToggleFullscreen}
                aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                aria-pressed={fullscreen}
              >
                <HugeiconsIcon
                  icon={fullscreen ? Minimize01Icon : Maximize01Icon}
                  strokeWidth={2}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {fullscreen ? "Exit fullscreen" : "Fullscreen"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <AlertDialog
        open={confirmArchive}
        onOpenChange={(open) => {
          if (!archiving) setConfirmArchive(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive "{conversation.title}". You can restore it later
              from archived conversations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={archiving}
              onClick={(event) => {
                event.preventDefault()
                void handleArchive()
              }}
            >
              {archiving ? "Archiving..." : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
