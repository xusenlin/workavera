import { useMemo, useRef, useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Archive02Icon,
  Delete02Icon,
  Edit01Icon,
  MoreHorizontalIcon,
  Pin02Icon,
  PlusSignIcon,
  Search02Icon,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { cn } from "@/lib/utils"
import { formatRelativeTime } from "@/lib/chat-utils"
import { useChatStore } from "@/store/chat"
import type { Conversation } from "@/types/chat"

import { ArchivedConversationsDialog } from "./archived-conversations-dialog"

function ConversationItem({
  conversation,
  isActive,
  onSelect,
}: {
  conversation: Conversation
  isActive: boolean
  onSelect: () => void
}) {
  const togglePin = useChatStore((s) => s.togglePin)
  const archiveConversation = useChatStore((s) => s.archiveConversation)
  const deleteConversation = useChatStore((s) => s.deleteConversation)
  const renameConversation = useChatStore((s) => s.renameConversation)

  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(conversation.title)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const ignoreRenameBlurRef = useRef(false)

  const handleRenameSubmit = async () => {
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === conversation.title) {
      setRenameValue(conversation.title)
      setRenaming(false)
      return
    }

    try {
      await renameConversation(conversation.id, trimmed)
      setRenaming(false)
    } catch {
      setRenameValue(conversation.title)
    }
  }

  return (
    <>
      <div
        className={cn(
          "group relative flex cursor-pointer flex-col gap-1 rounded-lg px-3 py-2.5 transition-colors",
          isActive ? "bg-muted" : "hover:bg-muted/60"
        )}
        onClick={onSelect}
      >
        {renaming ? (
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => {
              if (ignoreRenameBlurRef.current) {
                ignoreRenameBlurRef.current = false
                return
              }
              void handleRenameSubmit()
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                e.currentTarget.blur()
              }
              if (e.key === "Escape") {
                e.preventDefault()
                ignoreRenameBlurRef.current = true
                setRenameValue(conversation.title)
                setRenaming(false)
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-7 text-sm"
          />
        ) : (
          <div className="flex items-start gap-2">
            {conversation.pinned && (
              <HugeiconsIcon
                icon={Pin02Icon}
                strokeWidth={2}
                className="mt-0.5 size-3 shrink-0 text-muted-foreground"
              />
            )}
            <span
              className={cn(
                "line-clamp-1 flex-1 text-sm font-medium",
                isActive ? "text-foreground" : "text-foreground/90",
                "pr-6"
              )}
            >
              {conversation.title}
            </span>
          </div>
        )}

        {!renaming && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatRelativeTime(conversation.updated)}</span>
            <span className="text-muted-foreground/50">·</span>
            <span>{conversation.message_count} msgs</span>
            {conversation.tool_call_count > 0 && (
              <>
                <span className="text-muted-foreground/50">·</span>
                <span>{conversation.tool_call_count} tools</span>
              </>
            )}
            {conversation.status === "archived" && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                Archived
              </Badge>
            )}
          </div>
        )}

        {/* Action menu */}
        {!renaming && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem onClick={() => void togglePin(conversation.id)}>
                <HugeiconsIcon icon={Pin02Icon} strokeWidth={2} />
                {conversation.pinned ? "Unpin" : "Pin"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setRenameValue(conversation.title)
                  setRenaming(true)
                }}
              >
                <HugeiconsIcon icon={Edit01Icon} strokeWidth={2} />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void archiveConversation(conversation.id).catch(() => {})}
                disabled={conversation.status === "archived"}
              >
                <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} />
                Archive
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove "{conversation.title}" and all its
              messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
                onClick={() => void deleteConversation(conversation.id).catch(() => {})}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ConversationGroup({
  label,
  conversations,
  activeId,
  onSelect,
}: {
  label: string
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
}) {
  if (conversations.length === 0) return null

  return (
    <div className="flex flex-col gap-1">
      <div className="px-3 pt-2 pb-1">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
      </div>
      {conversations.map((conv) => (
        <ConversationItem
          key={conv.id}
          conversation={conv}
          isActive={conv.id === activeId}
          onSelect={() => onSelect(conv.id)}
        />
      ))}
    </div>
  )
}

export function ConversationList() {
  const conversations = useChatStore((s) => s.conversations)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)
  const createConversation = useChatStore((s) => s.createConversation)
  const page = useChatStore((s) => s.page)
  const totalPages = useChatStore((s) => s.totalPages)
  const loading = useChatStore((s) => s.loading)
  const setPage = useChatStore((s) => s.setPage)

  const [query, setQuery] = useState("")
  const [archivedOpen, setArchivedOpen] = useState(false)

  const { pinned, recent } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? conversations.filter((c) => c.title.toLowerCase().includes(q))
      : conversations

    const sorted = [...filtered].sort(
      (a, b) =>
        new Date(b.updated).getTime() - new Date(a.updated).getTime()
    )

    return {
      pinned: sorted.filter((c) => c.pinned),
      recent: sorted.filter((c) => !c.pinned),
    }
  }, [conversations, query])

  const handleNew = () => {
    void createConversation().catch(() => {})
  }

  const hasResults = pinned.length > 0 || recent.length > 0

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r bg-sidebar">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Conversations</span>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setArchivedOpen(true)}
              aria-label="View archived"
              className="cursor-pointer"
            >
              <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleNew}
              aria-label="New conversation"
              className="cursor-pointer"
            >
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            </Button>
          </div>
        </div>
        <div className="relative">
          <HugeiconsIcon
            icon={Search02Icon}
            strokeWidth={2}
            className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search conversations..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2">
        {hasResults ? (
          <div className="flex flex-col gap-1">
            <ConversationGroup
              label="Pinned"
              conversations={pinned}
              activeId={activeConversationId}
              onSelect={setActiveConversation}
            />
            <ConversationGroup
              label="Recent"
              conversations={recent}
              activeId={activeConversationId}
              onSelect={setActiveConversation}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <HugeiconsIcon
              icon={Search02Icon}
              strokeWidth={2}
              className="size-6 opacity-50"
            />
            <p>No conversations found</p>
            {query && (
              <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
                Clear search
              </Button>
            )}
          </div>
        )}
      </div>

      {!loading && totalPages > 0 && (
        <Pagination className="justify-end px-2 py-1">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                text="Prev"
                onClick={() => void setPage(page - 1)}
                className={
                  page <= 1 || loading
                    ? "pointer-events-none opacity-50"
                    : "cursor-pointer"
                }
              />
            </PaginationItem>
            <span className="flex items-center px-2 text-xs text-muted-foreground">
              {page} / {Math.max(1, totalPages)}
            </span>
            <PaginationItem>
              <PaginationNext
                text="Next"
                onClick={() => void setPage(page + 1)}
                className={
                  page >= totalPages || loading
                    ? "pointer-events-none opacity-50"
                    : "cursor-pointer"
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      {archivedOpen && (
        <ArchivedConversationsDialog
          open={archivedOpen}
          onOpenChange={setArchivedOpen}
        />
      )}
    </div>
  )
}
