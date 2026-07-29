import { useCallback, useEffect, useState } from "react"

import { Archive02Icon, ArchiveRestoreIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { RecordModel } from "pocketbase"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Spinner } from "@/components/ui/spinner"
import { extractErrorMessage, isRequestAbort } from "@/lib/error"
import { pb } from "@/lib/pocketbase"
import { useBoardStore, type Project } from "@/store/board"

type ArchivedTaskRecord = RecordModel & {
  title: string
  description: string
  state: string
  expand?: {
    state?: RecordModel & { name: string }
  }
}

const TASKS_PER_PAGE = 10

export function ArchivedTasksDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const restoreTodo = useBoardStore((store) => store.restoreTodo)
  const [items, setItems] = useState<ArchivedTaskRecord[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const filter = pb.filter("project = {:project} && archived = true", {
      project: project.id,
    })
    const result = await pb
      .collection("board_tasks")
      .getList<ArchivedTaskRecord>(page, TASKS_PER_PAGE, {
        filter,
        sort: "-updated",
        expand: "state",
      })
    setItems(result.items)
    setTotalPages(Math.max(1, result.totalPages))
  }, [page, project.id])

  useEffect(() => {
    if (!open) return
    void Promise.resolve()
      .then(load)
      .catch((error) => {
        if (isRequestAbort(error)) return
        toast.error(
          extractErrorMessage(error, "Could not load archived tasks.")
        )
      })
      .finally(() => setLoading(false))
  }, [load, open])

  const restore = async (id: string) => {
    setRestoringId(id)
    try {
      await restoreTodo(id)
      if (items.length === 1 && page > 1) {
        setLoading(true)
        setPage((value) => value - 1)
      } else {
        await load()
      }
    } catch {
      // The store already reports a user-facing error.
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (value) {
          setLoading(true)
          setPage(1)
        }
        onOpenChange(value)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={Archive02Icon} className="size-4" />
            Archived tasks
          </DialogTitle>
          <DialogDescription>
            Restore tasks to their original state in {project.name}.
          </DialogDescription>
        </DialogHeader>

        <div className="no-scrollbar max-h-[50vh] space-y-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No archived tasks.
            </p>
          ) : (
            items.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{task.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {task.expand?.state?.name || "Original state"}
                    {task.description ? ` · ${task.description}` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={restoringId !== null}
                  aria-label={`Restore ${task.title}`}
                  title="Restore task"
                  onClick={() => void restore(task.id)}
                >
                  <HugeiconsIcon icon={ArchiveRestoreIcon} strokeWidth={2} />
                </Button>
              </div>
            ))
          )}
        </div>

        {!loading && items.length > 0 && (
          <Pagination className="justify-end pt-2">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  text="Prev"
                  onClick={() => {
                    setLoading(true)
                    setPage((value) => Math.max(1, value - 1))
                  }}
                  className={
                    page <= 1 || restoringId !== null
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>
              <span className="flex items-center px-2 text-xs text-muted-foreground">
                {page} / {totalPages}
              </span>
              <PaginationItem>
                <PaginationNext
                  text="Next"
                  onClick={() => {
                    setLoading(true)
                    setPage((value) => Math.min(totalPages, value + 1))
                  }}
                  className={
                    page >= totalPages || restoringId !== null
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
