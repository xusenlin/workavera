import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  AppWindowIcon,
  Archive02Icon,
  ArchiveRestoreIcon,
  ArrowUpRightIcon,
  Delete02Icon,
  HtmlFile01Icon,
  MoreHorizontalIcon,
  Pin02Icon,
  Search02Icon,
} from "@hugeicons/core-free-icons"
import type { RecordModel } from "pocketbase"

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
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { extractErrorMessage } from "@/lib/error"
import { formatRelativeTime } from "@/lib/chat-utils"
import { pb } from "@/lib/pocketbase"

const PAGE_SIZE = 8

type AIMicroAppRecord = RecordModel & {
  name: string
  description: string
  html_file: string
  thumbnail: string
  status: "draft" | "published" | "archived"
  pinned: boolean
  updated: string
}

export function AIMicroAppsPage() {
  const [searchParams] = useSearchParams()
  const [pinnedApps, setPinnedApps] = useState<AIMicroAppRecord[]>([])
  const [apps, setApps] = useState<AIMicroAppRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")

  const loadList = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const trimmed = query.trim().replaceAll('"', '\\"')
      const searchFilter = trimmed
        ? ` && (name ~ "${trimmed}" || description ~ "${trimmed}")`
        : ""
      const [pinnedResult, appResult] = await Promise.all([
        pb.collection("ai_micro_apps").getList<AIMicroAppRecord>(1, 6, {
          filter: `pinned = true && status != 'archived'${searchFilter}`,
          sort: "-updated",
          requestKey: null,
        }),
        pb
          .collection("ai_micro_apps")
          .getList<AIMicroAppRecord>(page, PAGE_SIZE, {
            sort: "-updated",
            filter: `status != 'archived' && pinned = false${searchFilter}`,
            requestKey: null,
          }),
      ])
      setPinnedApps(pinnedResult.items)
      setApps(appResult.items)
      setTotalPages(appResult.totalPages || 1)
      setSelectedId((current) => {
        const requestedId = searchParams.get("app")
        const all = [...pinnedResult.items, ...appResult.items]
        if (all.length === 0) return null
        if (requestedId && all.some((a) => a.id === requestedId))
          return requestedId
        if (current && all.some((a) => a.id === current)) return current
        return all[0].id
      })
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load AI micro apps."))
    } finally {
      setLoading(false)
    }
  }, [page, query, searchParams])

  useEffect(() => {
    void Promise.resolve().then(() => loadList())
  }, [loadList])

  const allApps = [...pinnedApps, ...apps]
  const selectedApp = allApps.find((a) => a.id === selectedId) || null

  const togglePin = async (app: AIMicroAppRecord) => {
    try {
      await pb.send(`/api/ai-micro-apps/${app.id}/pin`, {
        method: "POST",
        body: { pinned: !app.pinned },
      })
      await loadList()
    } catch (err) {
      toast.error(extractErrorMessage(err, "Could not update pin."))
    }
  }

  const archiveApp = async (id: string) => {
    try {
      await pb.collection("ai_micro_apps").update(id, {
        status: "archived",
        pinned: false,
      })
      if (selectedId === id) setSelectedId(null)
      await loadList()
      toast.success("Archived.")
    } catch (err) {
      toast.error(extractErrorMessage(err, "Could not archive."))
    }
  }

  const deleteApp = async (id: string) => {
    try {
      await pb.collection("ai_micro_apps").delete(id)
      if (selectedId === id) setSelectedId(null)
      await loadList()
      toast.success("Deleted.")
    } catch (err) {
      toast.error(extractErrorMessage(err, "Could not delete."))
    }
  }

  const renameApp = async (id: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await pb.collection("ai_micro_apps").update(id, { name: trimmed })
      await loadList()
    } catch (err) {
      toast.error(extractErrorMessage(err, "Could not rename."))
    }
  }

  const startEditingTitle = () => {
    if (!selectedApp) return
    setTitleDraft(selectedApp.name)
    setEditingTitle(true)
  }

  const commitTitle = () => {
    if (selectedApp && titleDraft.trim() && titleDraft !== selectedApp.name) {
      void renameApp(selectedApp.id, titleDraft)
    }
    setEditingTitle(false)
  }

  return (
    <div className="-m-4 flex h-[calc(100vh-4rem)] overflow-hidden md:-m-6">
      {/* Left sidebar */}
      <aside className="flex h-full w-72 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex flex-col gap-2 border-b p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">AI Micro Apps</span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setArchivedOpen(true)}
                aria-label="Archived"
              >
                <HugeiconsIcon
                  icon={Archive02Icon}
                  strokeWidth={2}
                  className="size-4"
                />
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
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
              placeholder="Search micro apps..."
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        {error && (
          <div className="m-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <ListSkeleton />
          ) : pinnedApps.length === 0 && apps.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col gap-3">
              {pinnedApps.length > 0 && (
                <AppGroup label="Pinned">
                  {pinnedApps.map((app) => (
                    <AppListItem
                      key={app.id}
                      app={app}
                      selected={selectedId === app.id}
                      onSelect={setSelectedId}
                      onTogglePin={togglePin}
                      onArchive={archiveApp}
                      onDelete={deleteApp}
                    />
                  ))}
                </AppGroup>
              )}
              {apps.length > 0 && (
                <AppGroup label="Recent">
                  {apps.map((app) => (
                    <AppListItem
                      key={app.id}
                      app={app}
                      selected={selectedId === app.id}
                      onSelect={setSelectedId}
                      onTogglePin={togglePin}
                      onArchive={archiveApp}
                      onDelete={deleteApp}
                    />
                  ))}
                </AppGroup>
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
                  onClick={() => setPage((c) => Math.max(1, c - 1))}
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
                  onClick={() => setPage((c) => Math.min(totalPages, c + 1))}
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
      </aside>

      {/* Right panel */}
      <main className="flex min-w-0 flex-1 flex-col bg-background">
        {selectedApp ? (
          <>
            <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {editingTitle ? (
                  <Input
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitTitle()
                      if (e.key === "Escape") setEditingTitle(false)
                    }}
                    className="h-7 w-auto max-w-xs text-sm font-semibold"
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    onClick={startEditingTitle}
                    className="truncate text-sm font-semibold hover:underline"
                  >
                    {selectedApp.name}
                  </button>
                )}
                <Badge
                  variant="secondary"
                  className="hidden cursor-default gap-1 sm:flex"
                >
                  <span className="text-muted-foreground">ID</span>
                  <code className="text-[11px] text-foreground">
                    {selectedApp.id.slice(-8)}
                  </code>
                </Badge>
                <Badge variant="secondary" className="cursor-default gap-1">
                  {formatRelativeTime(selectedApp.updated)}
                </Badge>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => togglePin(selectedApp)}
                  aria-label={selectedApp.pinned ? "Unpin" : "Pin"}
                >
                  <HugeiconsIcon
                    icon={Pin02Icon}
                    strokeWidth={2}
                    className={cn(
                      "size-4",
                      selectedApp.pinned && "text-primary"
                    )}
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => archiveApp(selectedApp.id)}
                  aria-label="Archive"
                >
                  <HugeiconsIcon
                    icon={Archive02Icon}
                    strokeWidth={2}
                    className="size-4"
                  />
                </Button>
                <Button variant="ghost" size="icon-sm" asChild>
                  <a
                    href={`/api/ai-micro-apps/${selectedApp.id}/preview`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open in new tab"
                  >
                    <HugeiconsIcon
                      icon={ArrowUpRightIcon}
                      strokeWidth={2}
                      className="size-4"
                    />
                  </a>
                </Button>
              </div>
            </div>

            <div className="relative flex-1 overflow-hidden">
              <iframe
                key={selectedApp.id}
                title={`${selectedApp.name} preview`}
                src={`/api/ai-micro-apps/${selectedApp.id}/preview`}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                referrerPolicy="no-referrer"
                className="h-full w-full bg-white"
              />
            </div>
          </>
        ) : (
          <PreviewEmptyState />
        )}
      </main>

      {/* Archived dialog */}
      <ArchivedAppsDialog
        open={archivedOpen}
        onOpenChange={setArchivedOpen}
        onChanged={loadList}
      />
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────

function AppGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </div>
  )
}

function AppListItem({
  app,
  selected,
  onSelect,
  onTogglePin,
  onArchive,
  onDelete,
}: {
  app: AIMicroAppRecord
  selected: boolean
  onSelect: (id: string) => void
  onTogglePin: (app: AIMicroAppRecord) => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onSelect(app.id)}
        className={cn(
          "flex w-full cursor-pointer flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-colors",
          selected ? "bg-muted" : "hover:bg-muted/60"
        )}
      >
        <div className="flex items-center gap-1.5">
          {app.pinned && (
            <HugeiconsIcon
              icon={Pin02Icon}
              strokeWidth={2}
              className="size-3 shrink-0 text-primary"
            />
          )}
          <span className="line-clamp-1 text-sm font-medium text-foreground/90">
            {app.name}
          </span>
        </div>
        {app.description && (
          <span className="line-clamp-1 text-xs text-muted-foreground">
            {app.description}
          </span>
        )}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="absolute top-2 right-2 flex size-6 cursor-pointer items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted data-[state=open]:opacity-100"
          >
            <HugeiconsIcon
              icon={MoreHorizontalIcon}
              strokeWidth={2}
              className="size-4"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onTogglePin(app)}>
            <HugeiconsIcon
              icon={Pin02Icon}
              strokeWidth={2}
              className="size-4"
            />
            {app.pinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onArchive(app.id)}>
            <HugeiconsIcon
              icon={Archive02Icon}
              strokeWidth={2}
              className="size-4"
            />
            Archive
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <HugeiconsIcon
              icon={Delete02Icon}
              strokeWidth={2}
              className="size-4"
            />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete micro app?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{app.name}". This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(app.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ArchivedAppsDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void | Promise<void>
}) {
  const [archived, setArchived] = useState<AIMicroAppRecord[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    void Promise.resolve()
      .then(async () => {
        setLoading(true)
        const result = await pb
          .collection("ai_micro_apps")
          .getList<AIMicroAppRecord>(page, 10, {
            filter: "status = 'archived'",
            sort: "-updated",
            requestKey: null,
          })
        setArchived(result.items)
        setTotalPages(result.totalPages || 1)
      })
      .catch(() => setArchived([]))
      .finally(() => setLoading(false))
  }, [open, page])

  const unarchive = async (id: string) => {
    try {
      await pb.collection("ai_micro_apps").update(id, { status: "published" })
      setArchived((prev) => prev.filter((a) => a.id !== id))
      await onChanged()
      toast.success("Restored.")
    } catch (err) {
      toast.error(extractErrorMessage(err, "Could not restore."))
    }
  }

  const remove = async (id: string) => {
    try {
      await pb.collection("ai_micro_apps").delete(id)
      setArchived((prev) => prev.filter((a) => a.id !== id))
      await onChanged()
      toast.success("Deleted.")
    } catch (err) {
      toast.error(extractErrorMessage(err, "Could not delete."))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Archived micro apps</DialogTitle>
        </DialogHeader>
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : archived.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              No archived apps.
            </div>
          ) : (
            archived.map((app) => (
              <div
                key={app.id}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{app.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatRelativeTime(app.updated)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => unarchive(app.id)}
                    aria-label="Restore"
                  >
                    <HugeiconsIcon
                      icon={ArchiveRestoreIcon}
                      strokeWidth={2}
                      className="size-4"
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(app.id)}
                    aria-label="Delete"
                  >
                    <HugeiconsIcon
                      icon={Delete02Icon}
                      strokeWidth={2}
                      className="size-4 text-destructive"
                    />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
        {totalPages > 1 && (
          <Pagination className="justify-center">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  text="Prev"
                  onClick={() => setPage((c) => Math.max(1, c - 1))}
                  className={
                    page <= 1
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
                  onClick={() => setPage((c) => Math.min(totalPages, c + 1))}
                  className={
                    page >= totalPages
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

function ListSkeleton() {
  return (
    <div className="flex-1 space-y-1 p-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg px-3 py-2.5">
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-2.5 w-full animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
      <HugeiconsIcon
        icon={AppWindowIcon}
        strokeWidth={2}
        className="size-8 opacity-40"
      />
      <div>
        <p className="font-medium text-foreground">No AI micro apps yet</p>
        <p className="mt-1 text-xs">Ask the assistant to create one.</p>
      </div>
    </div>
  )
}

function PreviewEmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
      <HugeiconsIcon
        icon={HtmlFile01Icon}
        strokeWidth={2}
        className="size-8 opacity-40"
      />
      <p className="text-xs">Select an app to preview</p>
    </div>
  )
}
