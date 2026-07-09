import { useEffect, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Archive02Icon, ArchiveRestoreIcon } from "@hugeicons/core-free-icons"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { formatRelativeTime } from "@/lib/chat-utils"
import { useChatStore } from "@/store/chat"
import type { Conversation } from "@/types/chat"

const PER_PAGE = 10

export function ArchivedConversationsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const loadArchived = useChatStore((s) => s.loadArchived)
  const unarchiveConversation = useChatStore((s) => s.unarchiveConversation)
  const [items, setItems] = useState<Conversation[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    let active = true
    void loadArchived(page, PER_PAGE)
      .then((data) => {
        if (!active) return
        setItems(data.items ?? [])
        setTotalPages(data.totalPages ?? 0)
        setTotal(data.totalItems ?? 0)
      })
      .catch(() => {
        if (!active) return
        setItems([])
        setTotalPages(0)
        setTotal(0)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, page, loadArchived])

  const handleUnarchive = async (id: string) => {
    try {
      await unarchiveConversation(id)
      setItems((prev) => prev.filter((c) => c.id !== id))
      setTotal((prev) => {
        const nextTotal = Math.max(0, prev - 1)
        const nextTotalPages = Math.ceil(nextTotal / PER_PAGE)
        setTotalPages(nextTotalPages)
        if (nextTotalPages > 0 && page > nextTotalPages) {
          setLoading(true)
          setPage(nextTotalPages)
        }
        return nextTotal
      })
    } catch {
      // store already toasted
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon
              icon={Archive02Icon}
              strokeWidth={2}
              className="size-4 text-muted-foreground"
            />
            Archived conversations
            {total > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({total})
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading...
            </p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No archived conversations
            </p>
          ) : (
            items.map((conversation) => (
              <div
                key={conversation.id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {conversation.title}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{formatRelativeTime(conversation.updated)}</span>
                    <span className="text-muted-foreground/50">·</span>
                    <span>{conversation.message_count} msgs</span>
                    {conversation.tool_call_count > 0 && (
                      <>
                        <span className="text-muted-foreground/50">·</span>
                        <span>{conversation.tool_call_count} tools</span>
                      </>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Unarchive"
                  onClick={() => void handleUnarchive(conversation.id)}
                >
                  <HugeiconsIcon
                    icon={ArchiveRestoreIcon}
                    strokeWidth={2}
                    className="size-4"
                  />
                </Button>
              </div>
            ))
          )}
        </div>

        {!loading && total > 0 && (
          <Pagination className="justify-end pt-2">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  text="Prev"
                  onClick={() => {
                    setLoading(true)
                    setPage((p) => Math.max(1, p - 1))
                  }}
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
                  onClick={() => {
                    setLoading(true)
                    setPage((p) => Math.min(totalPages, p + 1))
                  }}
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
      </DialogContent>
    </Dialog>
  )
}
