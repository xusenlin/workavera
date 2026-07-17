import { useCallback, useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Archive02Icon,
  ArchiveRestoreIcon,
  ArrowRight01Icon,
  BellIcon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  MoreHorizontalIcon,
  Pin02Icon,
  Search02Icon,
} from "@hugeicons/core-free-icons"
import type { RecordModel } from "pocketbase"
import { toast } from "sonner"

import { NotificationItem } from "@/components/notifications/notification-item"
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
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { formatRelativeTime } from "@/lib/chat-utils"
import { pb } from "@/lib/pocketbase"
import {
  requestedRecordId,
  workspaceRecordUrl,
} from "@/lib/workspace-navigation"
import {
  useNotificationsStore,
  type AppNotification,
  type NotificationReadFilter,
  type NotificationType,
  type NotificationTypeFilter,
} from "@/store/notifications"

const TYPE_LABELS: Record<NotificationType, string> = {
  model_share: "Model share",
  task_due: "Task due",
  calendar_event: "Calendar event",
}

export function NotificationsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedNotificationId = requestedRecordId(searchParams)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedSnapshot, setSelectedSnapshot] =
    useState<AppNotification | null>(null)
  const [searchInput, setSearchInput] = useState(
    () => useNotificationsStore.getState().query
  )
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AppNotification | null>(null)

  const items = useNotificationsStore((state) => state.items)
  const query = useNotificationsStore((state) => state.query)
  const readFilter = useNotificationsStore((state) => state.readFilter)
  const typeFilter = useNotificationsStore((state) => state.typeFilter)
  const page = useNotificationsStore((state) => state.page)
  const totalPages = useNotificationsStore((state) => state.totalPages)
  const totalItems = useNotificationsStore((state) => state.totalItems)
  const loading = useNotificationsStore((state) => state.loading)
  const unreadCount = useNotificationsStore((state) => state.unreadCount)
  const loadPage = useNotificationsStore((state) => state.loadPage)
  const openNotification = useNotificationsStore(
    (state) => state.openNotification
  )
  const setQuery = useNotificationsStore((state) => state.setQuery)
  const setReadFilter = useNotificationsStore((state) => state.setReadFilter)
  const setTypeFilter = useNotificationsStore((state) => state.setTypeFilter)
  const markRead = useNotificationsStore((state) => state.markRead)
  const markAllRead = useNotificationsStore((state) => state.markAllRead)
  const togglePin = useNotificationsStore((state) => state.togglePin)
  const archive = useNotificationsStore((state) => state.archive)
  const deleteNotification = useNotificationsStore(
    (state) => state.deleteNotification
  )
  const respondToShare = useNotificationsStore((state) => state.respondToShare)

  useEffect(() => {
    void Promise.resolve().then(() => loadPage(1))
  }, [loadPage])

  useEffect(() => {
    if (searchInput === query) return
    const timer = window.setTimeout(() => void setQuery(searchInput), 250)
    return () => window.clearTimeout(timer)
  }, [query, searchInput, setQuery])

  useEffect(() => {
    if (!requestedNotificationId || requestedNotificationId === selectedId)
      return
    let active = true
    void openNotification(requestedNotificationId).then((notification) => {
      if (!active) return
      if (!notification) {
        setSelectedId(null)
        setSelectedSnapshot(null)
        navigate("/notifications", { replace: true })
        return
      }
      const snapshot = notification.readAt
        ? notification
        : { ...notification, readAt: new Date().toISOString() }
      setSelectedId(notification.id)
      setSelectedSnapshot(snapshot)
      void markRead(notification.id)
    })
    return () => {
      active = false
    }
  }, [
    markRead,
    navigate,
    openNotification,
    requestedNotificationId,
    selectedId,
  ])

  const activeId = selectedId ?? requestedNotificationId ?? items[0]?.id
  const selected =
    items.find((item) => item.id === activeId) ??
    (selectedSnapshot?.id === activeId ? selectedSnapshot : null)
  const pinnedItems = items.filter((item) => item.pinned)
  const recentItems = items.filter((item) => !item.pinned)
  const hasActiveFilters =
    Boolean(query.trim()) || readFilter !== "all" || typeFilter !== "all"

  const selectNotification = (notification: AppNotification) => {
    setSelectedId(notification.id)
    setSelectedSnapshot(
      notification.readAt
        ? notification
        : { ...notification, readAt: new Date().toISOString() }
    )
    void markRead(notification.id)
    navigate(workspaceRecordUrl("notifications", notification.id), {
      replace: true,
    })
  }

  const clearSelection = () => {
    setSelectedId(null)
    setSelectedSnapshot(null)
    navigate("/notifications", { replace: true })
  }

  const archiveNotification = async (notification: AppNotification) => {
    await archive(notification.id)
    if (activeId === notification.id) clearSelection()
  }

  const removeNotification = async () => {
    if (!deleteTarget) return
    const deletingId = deleteTarget.id
    await deleteNotification(deletingId)
    setDeleteTarget(null)
    if (activeId === deletingId) clearSelection()
  }

  return (
    <div className="-m-4 flex h-[calc(100vh-4rem)] overflow-hidden md:-m-6">
      <aside className="flex h-full w-80 shrink-0 flex-col border-r bg-sidebar">
        <div className="space-y-3 border-b p-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-sm font-semibold">Notifications</h1>
              <p className="text-xs text-muted-foreground">
                {totalItems} {hasActiveFilters ? "matching" : "active"} ·{" "}
                {unreadCount} unread
              </p>
            </div>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                disabled={unreadCount === 0}
                onClick={() => void markAllRead()}
              >
                Mark all read
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setArchivedOpen(true)}
                aria-label="View archived notifications"
              >
                <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} />
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
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search notifications…"
              className="h-8 pl-8"
            />
          </div>
          <div className="flex gap-2">
            <Select
              value={readFilter}
              onValueChange={(value) =>
                void setReadFilter(value as NotificationReadFilter)
              }
            >
              <SelectTrigger className="h-8 flex-1 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="read">Read</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={typeFilter}
              onValueChange={(value) =>
                void setTypeFilter(value as NotificationTypeFilter)
              }
            >
              <SelectTrigger className="h-8 flex-1 text-xs">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner className="size-5" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <HugeiconsIcon
                icon={BellIcon}
                strokeWidth={2}
                className="size-8 opacity-40"
              />
              <p className="text-sm">No matching notifications</p>
            </div>
          ) : (
            <div className="space-y-3">
              <NotificationGroup
                label="Pinned"
                items={pinnedItems}
                activeId={activeId}
                onSelect={selectNotification}
                onTogglePin={(notification) =>
                  togglePin(notification.id, !notification.pinned)
                }
                onArchive={archiveNotification}
                onDelete={setDeleteTarget}
              />
              <NotificationGroup
                label="Recent"
                items={recentItems}
                activeId={activeId}
                onSelect={selectNotification}
                onTogglePin={(notification) =>
                  togglePin(notification.id, !notification.pinned)
                }
                onArchive={archiveNotification}
                onDelete={setDeleteTarget}
              />
            </div>
          )}
        </div>

        {!loading && totalPages > 0 && (
          <Pagination className="justify-end px-2 py-1">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  text="Prev"
                  onClick={() => void loadPage(Math.max(1, page - 1))}
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
                  onClick={() => void loadPage(Math.min(totalPages, page + 1))}
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

      <main className="flex min-w-0 flex-1 flex-col bg-background">
        {selected ? (
          <NotificationDetail
            notification={selected}
            onRespond={async (decision) => {
              await respondToShare(selected, decision)
              setSelectedSnapshot({
                ...selected,
                data: {
                  ...selected.data,
                  shareStatus: decision === "accept" ? "accepted" : "rejected",
                },
              })
            }}
            onOpenTask={() =>
              navigate(workspaceRecordUrl("board", selected.data.taskId ?? ""))
            }
            onOpenEvent={() =>
              navigate(
                `${workspaceRecordUrl("calendar", selected.data.eventId ?? "")}&occurrence=${encodeURIComponent(selected.data.occurrenceDate ?? "")}`
              )
            }
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
            <HugeiconsIcon
              icon={BellIcon}
              strokeWidth={2}
              className="size-9 opacity-40"
            />
            <p className="text-sm">Select a notification to view details</p>
          </div>
        )}
      </main>

      <ArchivedNotificationsDialog
        open={archivedOpen}
        onOpenChange={setArchivedOpen}
      />
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete notification?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.title}” will be permanently deleted. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void removeNotification()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function NotificationGroup({
  label,
  items,
  activeId,
  onSelect,
  onTogglePin,
  onArchive,
  onDelete,
}: {
  label: string
  items: AppNotification[]
  activeId?: string
  onSelect: (notification: AppNotification) => void
  onTogglePin: (notification: AppNotification) => Promise<void>
  onArchive: (notification: AppNotification) => Promise<void>
  onDelete: (notification: AppNotification) => void
}) {
  if (items.length === 0) return null
  return (
    <section>
      <p className="px-3 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <div className="space-y-1">
        {items.map((notification) => (
          <div key={notification.id} className="group relative">
            <NotificationItem
              notification={notification}
              selected={notification.id === activeId}
              className="pr-10"
              onClick={() => onSelect(notification)}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Notification actions"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => void onTogglePin(notification)}
                >
                  <HugeiconsIcon icon={Pin02Icon} strokeWidth={2} />
                  {notification.pinned ? "Unpin" : "Pin"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void onArchive(notification)}>
                  <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} />
                  Archive
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onDelete(notification)}
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
    </section>
  )
}

type ArchivedNotificationRecord = RecordModel & {
  type: NotificationType
  title: string
  body: string
  updated: string
}

function ArchivedNotificationsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [items, setItems] = useState<ArchivedNotificationRecord[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] =
    useState<ArchivedNotificationRecord | null>(null)
  const restore = useNotificationsStore((state) => state.restore)
  const deleteNotification = useNotificationsStore(
    (state) => state.deleteNotification
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await pb
        .collection("notifications")
        .getList<ArchivedNotificationRecord>(page, 10, {
          filter: 'status = "archived"',
          sort: "-updated",
          fields: "id,type,title,body,updated",
          requestKey: null,
        })
      setItems(result.items)
      setTotalPages(Math.max(1, result.totalPages))
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not load archived notifications"
      )
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    if (!open) return
    void Promise.resolve().then(load)
  }, [load, open])

  const restoreItem = async (id: string) => {
    await restore(id)
    await load()
  }

  const removeItem = async () => {
    if (!deleteTarget) return
    await deleteNotification(deleteTarget.id)
    setDeleteTarget(null)
    await load()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HugeiconsIcon icon={Archive02Icon} className="size-4" />
              Archived notifications
            </DialogTitle>
            <DialogDescription>
              Restore notifications to the active list or permanently delete
              them.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-10">
                <Spinner />
              </div>
            ) : items.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No archived notifications.
              </p>
            ) : (
              items.map((notification) => (
                <div
                  key={notification.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {notification.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {TYPE_LABELS[notification.type]} ·{" "}
                      {formatRelativeTime(notification.updated)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Restore notification"
                    onClick={() => void restoreItem(notification.id)}
                  >
                    <HugeiconsIcon icon={ArchiveRestoreIcon} strokeWidth={2} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete notification"
                    onClick={() => setDeleteTarget(notification)}
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
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
        onOpenChange={(value) => !value && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete notification permanently?
            </AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.title}” will be permanently deleted. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void removeItem()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function NotificationDetail({
  notification,
  onRespond,
  onOpenTask,
  onOpenEvent,
}: {
  notification: AppNotification
  onRespond: (decision: "accept" | "reject") => Promise<void>
  onOpenTask: () => void
  onOpenEvent: () => void
}) {
  const [responding, setResponding] = useState(false)
  const shareStatus = notification.data.shareStatus ?? "pending"

  const respond = async (decision: "accept" | "reject") => {
    setResponding(true)
    try {
      await onRespond(decision)
    } finally {
      setResponding(false)
    }
  }

  return (
    <>
      <div className="flex h-14 items-center justify-between border-b px-5">
        <span className="text-sm font-semibold">Notification details</span>
        <span className="text-xs text-muted-foreground">
          {formatRelativeTime(notification.created)}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-2xl space-y-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {TYPE_LABELS[notification.type]}
              </Badge>
              {notification.pinned && (
                <Badge variant="outline">
                  <HugeiconsIcon icon={Pin02Icon} strokeWidth={2} /> Pinned
                </Badge>
              )}
              {!notification.readAt && <Badge>Unread</Badge>}
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {notification.title}
            </h2>
            <p className="leading-relaxed text-muted-foreground">
              {notification.body}
            </p>
          </div>

          {notification.type === "model_share" && (
            <div className="rounded-xl border bg-card p-4">
              <p className="text-sm font-medium">
                {notification.data.modelName}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Shared by {notification.data.senderName}. Accepting creates an
                independent model configuration.
              </p>
              {shareStatus === "pending" ? (
                <div className="mt-4 flex gap-2">
                  <Button
                    disabled={responding}
                    onClick={() => void respond("accept")}
                  >
                    <HugeiconsIcon
                      icon={CheckmarkCircle02Icon}
                      strokeWidth={2}
                    />{" "}
                    Accept
                  </Button>
                  <Button
                    variant="outline"
                    disabled={responding}
                    onClick={() => void respond("reject")}
                  >
                    <HugeiconsIcon icon={CancelCircleIcon} strokeWidth={2} />{" "}
                    Reject
                  </Button>
                </div>
              ) : (
                <Badge
                  className="mt-4 capitalize"
                  variant={shareStatus === "accepted" ? "default" : "secondary"}
                >
                  {shareStatus}
                </Badge>
              )}
            </div>
          )}

          {notification.type === "task_due" && (
            <Button onClick={onOpenTask}>
              View task{" "}
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
            </Button>
          )}
          {notification.type === "calendar_event" && (
            <Button onClick={onOpenEvent}>
              View event{" "}
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
            </Button>
          )}
        </div>
      </div>
    </>
  )
}
