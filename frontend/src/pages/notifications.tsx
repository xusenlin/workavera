import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  BellIcon,
  CheckmarkCircle02Icon,
  CancelCircleIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { NotificationItem } from "@/components/notifications/notification-item"
import { cn } from "@/lib/utils"
import { formatRelativeTime } from "@/lib/chat-utils"
import {
  useNotificationsStore,
  type AppNotification,
} from "@/store/notifications"

export function NotificationsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedSnapshot, setSelectedSnapshot] =
    useState<AppNotification | null>(null)
  const items = useNotificationsStore((state) => state.items)
  const filter = useNotificationsStore((state) => state.filter)
  const page = useNotificationsStore((state) => state.page)
  const totalPages = useNotificationsStore((state) => state.totalPages)
  const loading = useNotificationsStore((state) => state.loading)
  const unreadCount = useNotificationsStore((state) => state.unreadCount)
  const loadPage = useNotificationsStore((state) => state.loadPage)
  const setFilter = useNotificationsStore((state) => state.setFilter)
  const markRead = useNotificationsStore((state) => state.markRead)
  const markAllRead = useNotificationsStore((state) => state.markAllRead)
  const respondToShare = useNotificationsStore((state) => state.respondToShare)

  useEffect(() => {
    void loadPage(1)
  }, [loadPage])

  const activeId =
    selectedId ?? searchParams.get("notification") ?? items[0]?.id
  const selected =
    items.find((item) => item.id === activeId) ??
    (selectedSnapshot?.id === activeId ? selectedSnapshot : null)

  const selectNotification = (notification: AppNotification) => {
    setSelectedId(notification.id)
    setSelectedSnapshot(notification)
    void markRead(notification.id)
  }

  return (
    <div className="-m-4 flex h-[calc(100vh-4rem)] overflow-hidden md:-m-6">
      <aside className="flex h-full w-96 shrink-0 flex-col border-r bg-sidebar">
        <div className="space-y-3 border-b p-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-sm font-semibold">Notifications</h1>
              <p className="text-xs text-muted-foreground">
                {unreadCount} unread
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={unreadCount === 0}
              onClick={() => void markAllRead()}
            >
              Mark all read
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {(["all", "unread"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => void setFilter(value)}
                className={cn(
                  "cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium capitalize",
                  filter === value
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground"
                )}
              >
                {value}
              </button>
            ))}
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
              <p className="text-sm">
                {filter === "unread"
                  ? "No unread notifications"
                  : "No notifications yet"}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {items.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  selected={notification.id === activeId}
                  onClick={() => selectNotification(notification)}
                />
              ))}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t p-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => void loadPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => void loadPage(page + 1)}
            >
              Next
            </Button>
          </div>
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
              navigate(`/board?task=${selected.data.taskId ?? ""}`)
            }
            onOpenEvent={() =>
              navigate(
                `/calendar?event=${selected.data.eventId ?? ""}&occurrence=${selected.data.occurrenceDate ?? ""}`
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
    </div>
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
                {notification.type.replaceAll("_", " ")}
              </Badge>
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
