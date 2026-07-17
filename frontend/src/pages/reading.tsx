import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { toast } from "sonner"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Archive02Icon,
  ArchiveRestoreIcon,
  ArrowDown01Icon,
  ArrowUpRightIcon,
  BookOpen01Icon,
  Delete02Icon,
  MoreHorizontalIcon,
  Pin02Icon,
  Search02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Label } from "@/components/ui/label"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Textarea } from "@/components/ui/textarea"
import {
  READING_STATUS_META,
  readingErrorMessage,
  toReadingItem,
  useReadingStore,
  type ReadingItem,
  type ReadingItemRecord,
  type ReadingStatus,
  type ReadingStatusFilter,
} from "@/store/reading"
import { cn } from "@/lib/utils"
import { formatRelativeTime } from "@/lib/chat-utils"
import { pb } from "@/lib/pocketbase"
import {
  requestedRecordId,
  workspaceRecordUrl,
} from "@/lib/workspace-navigation"

const NO_PROJECT = "__none__"
const ALL = "all"

type ItemForm = {
  title: string
  url: string
  description: string
  projectId: string
  tags: string
  contentText: string
  summary: string
  keyPoints: string
  status: ReadingStatus
  summaryLanguage: string
}

const emptyForm: ItemForm = {
  title: "",
  url: "",
  description: "",
  projectId: NO_PROJECT,
  tags: "",
  contentText: "",
  summary: "",
  keyPoints: "",
  status: "unread",
  summaryLanguage: "English",
}

const SUMMARY_LANGUAGES = [
  { value: "English", label: "English" },
  { value: "中文", label: "中文" },
  { value: "日本語", label: "日本語" },
]

export function ReadingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedReadingId = requestedRecordId(searchParams)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState(
    () => useReadingStore.getState().query
  )
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState<ItemForm>(emptyForm)
  const [detailForm, setDetailForm] = useState<ItemForm>(emptyForm)
  const [summarizeError, setSummarizeError] = useState<string | null>(null)
  const [summarizeConfirmOpen, setSummarizeConfirmOpen] = useState(false)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ReadingItem | null>(null)

  const items = useReadingStore((s) => s.items)
  const openedItem = useReadingStore((s) => s.openedItem)
  const projects = useReadingStore((s) => s.projects)
  const query = useReadingStore((s) => s.query)
  const statusFilter = useReadingStore((s) => s.statusFilter)
  const projectFilter = useReadingStore((s) => s.projectFilter)
  const page = useReadingStore((s) => s.page)
  const totalPages = useReadingStore((s) => s.totalPages)
  const totalItems = useReadingStore((s) => s.totalItems)
  const unreadCount = useReadingStore((s) => s.unreadCount)
  const loading = useReadingStore((s) => s.loading)
  const saving = useReadingStore((s) => s.saving)
  const markingAllRead = useReadingStore((s) => s.markingAllRead)
  const summarizing = useReadingStore((s) => s.summarizing)
  const fetchItems = useReadingStore((s) => s.fetchItems)
  const fetchProjects = useReadingStore((s) => s.fetchProjects)
  const setQuery = useReadingStore((s) => s.setQuery)
  const setStatusFilter = useReadingStore((s) => s.setStatusFilter)
  const setProjectFilter = useReadingStore((s) => s.setProjectFilter)
  const openItem = useReadingStore((s) => s.openItem)
  const rememberOpenedItem = useReadingStore((s) => s.rememberOpenedItem)
  const addItem = useReadingStore((s) => s.addItem)
  const updateItem = useReadingStore((s) => s.updateItem)
  const deleteItem = useReadingStore((s) => s.deleteItem)
  const markAllRead = useReadingStore((s) => s.markAllRead)
  const summarizeItem = useReadingStore((s) => s.summarizeItem)
  const togglePin = useReadingStore((s) => s.togglePin)

  const selectItem = useCallback(
    (item: ReadingItem | null) => {
      setSelectedId(item?.id ?? null)
      setDetailForm(item ? toForm(item) : emptyForm)
      setSummarizeError(null)
      rememberOpenedItem(item)
      navigate(item ? workspaceRecordUrl("reading", item.id) : "/reading", {
        replace: true,
      })
    },
    [navigate, rememberOpenedItem]
  )

  useEffect(() => {
    void Promise.resolve().then(() =>
      Promise.all([fetchItems(1), fetchProjects()])
    )
  }, [fetchItems, fetchProjects])

  useEffect(() => {
    if (searchInput === query) return
    const timer = window.setTimeout(() => void setQuery(searchInput), 250)
    return () => window.clearTimeout(timer)
  }, [query, searchInput, setQuery])

  useEffect(() => {
    if (loading || requestedReadingId === selectedId) return
    if (requestedReadingId) {
      let active = true
      void openItem(requestedReadingId).then((item) => {
        if (!active) return
        if (item) {
          selectItem(item)
        } else {
          navigate("/reading", { replace: true })
        }
      })
      return () => {
        active = false
      }
    }
    if (selectedId) return
    const firstItem = items.find((item) => item.pinned) ?? items[0]
    if (firstItem) {
      void Promise.resolve().then(() => selectItem(firstItem))
    }
  }, [
    items,
    loading,
    openItem,
    navigate,
    requestedReadingId,
    selectItem,
    selectedId,
  ])

  const projectNames = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.name])),
    [projects]
  )

  const pinnedItems = items.filter((i) => i.pinned)
  const recentItems = items.filter((i) => !i.pinned)
  const hasActiveFilters =
    Boolean(query.trim()) || statusFilter !== ALL || projectFilter !== ALL

  const selectedItem =
    items.find((i) => i.id === selectedId) ??
    (openedItem?.id === selectedId ? openedItem : null)

  const handleAdd = async () => {
    const item = await addItem(fromForm(addForm))
    selectItem(item)
    setAddOpen(false)
    setAddForm(emptyForm)
  }

  const handleSave = async () => {
    if (!selectedItem) return
    await updateItem(selectedItem.id, fromForm(detailForm))
    if (detailForm.status === "archived") selectItem(null)
  }

  const handleSummarize = async () => {
    if (!selectedItem) return
    setSummarizeError(null)
    const toastId = toast.loading(
      `Fetching article and generating summary in ${detailForm.summaryLanguage || "English"}...`
    )
    try {
      await summarizeItem(selectedItem.id)
      const next = useReadingStore
        .getState()
        .items.find((i) => i.id === selectedItem.id)
      const opened = useReadingStore.getState().openedItem
      if (next) setDetailForm(toForm(next))
      else if (opened?.id === selectedItem.id) setDetailForm(toForm(opened))
      toast.success("Article fetched and summarized", { id: toastId })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch or summarize"
      setSummarizeError(message)
      toast.error(message, { id: toastId })
    }
  }

  const handleArchive = async (item: ReadingItem) => {
    await updateItem(item.id, { status: "archived", pinned: false })
    if (selectedId === item.id) selectItem(null)
  }

  const handleDelete = async (item: ReadingItem) => {
    await deleteItem(item.id)
    if (selectedId === item.id) selectItem(null)
    setDeleteTarget(null)
  }

  const handleTogglePin = async (item: ReadingItem) => {
    await togglePin(item.id, !item.pinned).catch(() => undefined)
  }

  const handleMarkAllRead = async () => {
    const updated = await markAllRead()
    if (updated > 0 && selectedItem?.status === "unread") {
      setDetailForm((form) => ({ ...form, status: "read" }))
    }
  }

  return (
    <div className="-m-4 flex h-[calc(100vh-4rem)] overflow-hidden md:-m-6">
      {/* Left sidebar */}
      <aside className="flex h-full w-80 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex flex-col gap-2 border-b p-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-semibold">Reading</span>
              <p className="text-xs text-muted-foreground">
                {totalItems} {hasActiveFilters ? "matching" : "active"} ·{" "}
                {unreadCount} unread
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={unreadCount === 0 || markingAllRead}
                onClick={() => void handleMarkAllRead()}
              >
                Mark all read
              </Button>
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
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setAddOpen(true)}
                aria-label="Add link"
              >
                <HugeiconsIcon
                  icon={Add01Icon}
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
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search reading items..."
              className="h-8 pl-8 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                void setStatusFilter(value as ReadingStatusFilter)
              }
            >
              <SelectTrigger className="h-8 flex-1 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="read">Read</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={projectFilter}
              onValueChange={(value) => void setProjectFilter(value)}
            >
              <SelectTrigger className="h-8 flex-1 text-xs">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-lg px-3 py-2.5"
                >
                  <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-2.5 w-full animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : pinnedItems.length === 0 && recentItems.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
              <HugeiconsIcon
                icon={BookOpen01Icon}
                strokeWidth={2}
                className="size-8 opacity-40"
              />
              <div>
                <p className="font-medium text-foreground">
                  No reading items yet
                </p>
                <p className="mt-1 text-xs">
                  Add a link to start collecting references.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {pinnedItems.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Pinned
                  </span>
                  {pinnedItems.map((item) => (
                    <ReadingListItem
                      key={item.id}
                      item={item}
                      selected={selectedId === item.id}
                      onSelect={selectItem}
                      onTogglePin={handleTogglePin}
                      onArchive={handleArchive}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </div>
              )}
              {recentItems.length > 0 && (
                <div className="flex flex-col gap-1">
                  {pinnedItems.length > 0 && (
                    <span className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Recent
                    </span>
                  )}
                  {recentItems.map((item) => (
                    <ReadingListItem
                      key={item.id}
                      item={item}
                      selected={selectedId === item.id}
                      onSelect={selectItem}
                      onTogglePin={handleTogglePin}
                      onArchive={handleArchive}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </div>
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
                  onClick={() => void fetchItems(Math.max(1, page - 1))}
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
                  onClick={() =>
                    void fetchItems(Math.min(totalPages, page + 1))
                  }
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
        {selectedItem ? (
          <>
            <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate text-sm font-semibold">
                  {selectedItem.title}
                </span>
                <Badge
                  variant="secondary"
                  className="hidden cursor-default gap-1 sm:flex"
                >
                  <span className="text-muted-foreground">ID</span>
                  <code className="text-[11px] text-foreground">
                    {selectedItem.id.slice(-8)}
                  </code>
                </Badge>
                <Badge variant="secondary" className="cursor-default">
                  {READING_STATUS_META[selectedItem.status].label}
                </Badge>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {formatRelativeTime(selectedItem.updatedAt)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleTogglePin(selectedItem)}
                  aria-label={selectedItem.pinned ? "Unpin" : "Pin"}
                >
                  <HugeiconsIcon
                    icon={Pin02Icon}
                    strokeWidth={2}
                    className={cn(
                      "size-4",
                      selectedItem.pinned && "text-primary"
                    )}
                  />
                </Button>
                <Button variant="ghost" size="icon-sm" asChild>
                  <a
                    href={selectedItem.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open link"
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

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <ItemFormFields
                form={detailForm}
                setForm={setDetailForm}
                projects={projects}
                summarizeError={summarizeError}
              />
            </div>

            <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-popover px-4 py-3">
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(selectedItem)}
                disabled={saving || summarizing}
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                Delete
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setSummarizeConfirmOpen(true)}
                  disabled={summarizing || saving || !detailForm.url.trim()}
                >
                  {summarizing ? "Fetching..." : "Fetch & summarize"}
                </Button>
                <Button
                  onClick={() => void handleSave()}
                  disabled={
                    saving || !detailForm.title.trim() || !detailForm.url.trim()
                  }
                >
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
            <HugeiconsIcon
              icon={BookOpen01Icon}
              strokeWidth={2}
              className="size-8 opacity-40"
            />
            <p className="text-xs">Select an item to view details</p>
          </div>
        )}
      </main>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add reading item</DialogTitle>
            <DialogDescription>
              Save an external reference now. You can paste content and add
              summaries later.
            </DialogDescription>
          </DialogHeader>
          <ItemFormFields
            form={addForm}
            setForm={setAddForm}
            projects={projects}
            summarizeError={null}
            compact
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleAdd()}
              disabled={saving || !addForm.title.trim() || !addForm.url.trim()}
            >
              {saving ? "Adding..." : "Add link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archived dialog */}
      <ArchivedItemsDialog
        open={archivedOpen}
        onOpenChange={setArchivedOpen}
        projectNames={projectNames}
      />

      {/* Summarize confirm */}
      <AlertDialog
        open={summarizeConfirmOpen}
        onOpenChange={setSummarizeConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fetch and summarize?</AlertDialogTitle>
            <AlertDialogDescription>
              This will fetch the article content from the URL and regenerate
              the summary. Existing content, summary, and key points will be
              overwritten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleSummarize()}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete reading item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove "{deleteTarget?.title}" from your
              reading library. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleteTarget && void handleDelete(deleteTarget)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ReadingListItem({
  item,
  selected,
  onSelect,
  onTogglePin,
  onArchive,
  onDelete,
}: {
  item: ReadingItem
  selected: boolean
  onSelect: (item: ReadingItem) => void
  onTogglePin: (item: ReadingItem) => void
  onArchive: (item: ReadingItem) => void
  onDelete: (item: ReadingItem) => void
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onSelect(item)}
        className={cn(
          "flex w-full cursor-pointer flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-colors",
          selected ? "bg-muted" : "hover:bg-muted/60"
        )}
      >
        <div className="flex items-center gap-1.5">
          {item.pinned && (
            <HugeiconsIcon
              icon={Pin02Icon}
              strokeWidth={2}
              className="size-3 shrink-0 text-primary"
            />
          )}
          {item.status === "unread" && (
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-blue-500" />
          )}
          <span className="line-clamp-1 text-sm font-medium text-foreground/90">
            {item.title}
          </span>
        </div>
        {(item.description || item.summary) && (
          <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {item.description || item.summary}
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
          <DropdownMenuItem onClick={() => onTogglePin(item)}>
            <HugeiconsIcon
              icon={Pin02Icon}
              strokeWidth={2}
              className="size-4"
            />
            {item.pinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onArchive(item)}>
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
            onClick={() => onDelete(item)}
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
    </div>
  )
}

function ArchivedItemsDialog({
  open,
  onOpenChange,
  projectNames,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectNames: Record<string, string>
}) {
  const [items, setItems] = useState<ReadingItem[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ReadingItem | null>(null)
  const updateItem = useReadingStore((s) => s.updateItem)
  const deleteItem = useReadingStore((s) => s.deleteItem)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await pb
        .collection("reading_items")
        .getList<ReadingItemRecord>(page, 10, {
          filter: 'status = "archived"',
          sort: "-updated",
          requestKey: null,
        })
      setItems(result.items.map(toReadingItem))
      setTotalPages(Math.max(1, result.totalPages))
    } catch (error) {
      toast.error(
        readingErrorMessage(error, "Could not load archived reading items")
      )
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    if (!open) return
    void Promise.resolve().then(load)
  }, [load, open])

  const unarchive = async (item: ReadingItem) => {
    await updateItem(item.id, { status: "unread" })
    await load()
    toast.success("Restored.")
  }

  const remove = async () => {
    if (!deleteTarget) return
    await deleteItem(deleteTarget.id)
    setDeleteTarget(null)
    await load()
    toast.success("Deleted.")
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) setPage(1)
          onOpenChange(nextOpen)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Archived reading items</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="size-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                No archived items.
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <div className="flex items-center gap-1">
                      {item.projectId && projectNames[item.projectId] && (
                        <Badge variant="outline" className="px-1.5 text-[10px]">
                          {projectNames[item.projectId]}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(item.updatedAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void unarchive(item)}
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
                      onClick={() => setDeleteTarget(item)}
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
          {!loading && items.length > 0 && (
            <Pagination className="justify-end pt-2">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    text="Prev"
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    className={
                      page <= 1 || loading
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
                    onClick={() =>
                      setPage((value) => Math.min(totalPages, value + 1))
                    }
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
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => !nextOpen && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete reading item permanently?
            </AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.title}” will be permanently deleted. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void remove()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ItemFormFields({
  form,
  setForm,
  projects,
  summarizeError,
  compact = false,
}: {
  form: ItemForm
  setForm: (form: ItemForm) => void
  projects: { id: string; name: string }[]
  summarizeError: string | null
  compact?: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor={compact ? "add-title" : "detail-title"}>Title</Label>
        <Input
          id={compact ? "add-title" : "detail-title"}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Article, repo, product page..."
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={compact ? "add-url" : "detail-url"}>URL</Label>
        <Input
          id={compact ? "add-url" : "detail-url"}
          value={form.url}
          onChange={(e) => setForm({ ...form, url: e.target.value })}
          placeholder="https://example.com"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Project</Label>
          <Select
            value={form.projectId}
            onValueChange={(projectId) => setForm({ ...form, projectId })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="No project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PROJECT}>No project</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Status</Label>
          <Select
            value={form.status}
            onValueChange={(status) =>
              setForm({ ...form, status: status as ReadingStatus })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="read">Read</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={compact ? "add-tags" : "detail-tags"}>Tags</Label>
        <Input
          id={compact ? "add-tags" : "detail-tags"}
          value={form.tags}
          onChange={(e) => setForm({ ...form, tags: e.target.value })}
          placeholder="PocketBase, AI Agent, research"
        />
      </div>
      <div className="grid gap-2">
        <Label>AI summary language</Label>
        <LanguageCombobox
          value={form.summaryLanguage}
          onChange={(summaryLanguage) => setForm({ ...form, summaryLanguage })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={compact ? "add-description" : "detail-description"}>
          Description
        </Label>
        <Textarea
          id={compact ? "add-description" : "detail-description"}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Why this reference matters..."
        />
      </div>
      {!compact && (
        <>
          {summarizeError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {summarizeError}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="detail-content">Content</Label>
            <Textarea
              id="detail-content"
              value={form.contentText}
              onChange={(e) =>
                setForm({ ...form, contentText: e.target.value })
              }
              placeholder="Paste fetched or copied article content here."
              className="min-h-32"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="detail-summary">Summary</Label>
            <Textarea
              id="detail-summary"
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              placeholder="AI or manual summary."
              className="min-h-28"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="detail-key-points">Key points</Label>
            <Textarea
              id="detail-key-points"
              value={form.keyPoints}
              onChange={(e) => setForm({ ...form, keyPoints: e.target.value })}
              placeholder="One key point per line."
              className="min-h-28"
            />
          </div>
        </>
      )}
    </div>
  )
}

function LanguageCombobox({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="English, 中文, 日本語, ..."
            className="pr-8"
          />
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        align="start"
      >
        <Command>
          <CommandList>
            <CommandGroup>
              {SUMMARY_LANGUAGES.map((lang) => (
                <CommandItem
                  key={lang.value}
                  value={lang.value}
                  onSelect={() => {
                    onChange(lang.value)
                    setOpen(false)
                  }}
                >
                  {lang.label}
                  {value === lang.value && (
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      strokeWidth={2}
                      className="ml-auto size-4"
                    />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function toForm(item: ReadingItem): ItemForm {
  return {
    title: item.title,
    url: item.url,
    description: item.description || "",
    projectId: item.projectId || NO_PROJECT,
    tags: item.tags.join(", "),
    contentText: item.contentText || "",
    summary: item.summary || "",
    keyPoints: item.keyPoints.join("\n"),
    status: item.status,
    summaryLanguage: item.summaryLanguage || "English",
  }
}

function fromForm(form: ItemForm) {
  return {
    title: form.title.trim(),
    url: form.url.trim(),
    description: form.description.trim(),
    projectId: form.projectId === NO_PROJECT ? "" : form.projectId,
    tags: splitList(form.tags),
    status: form.status,
    contentText: form.contentText.trim(),
    summary: form.summary.trim(),
    keyPoints: splitLines(form.keyPoints),
    summaryLanguage: form.summaryLanguage.trim() || "English",
  }
}

function splitList(value: string) {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
}
