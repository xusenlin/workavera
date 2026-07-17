import { HugeiconsIcon } from "@hugeicons/react"
import {
  Calendar03Icon,
  KanbanIcon,
  Pin02Icon,
  Share08Icon,
} from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"
import { formatRelativeTime } from "@/lib/chat-utils"
import type { AppNotification } from "@/store/notifications"

const icons = {
  model_share: Share08Icon,
  task_due: KanbanIcon,
  calendar_event: Calendar03Icon,
}

export function NotificationItem({
  notification,
  selected = false,
  compact = false,
  className,
  onClick,
}: {
  notification: AppNotification
  selected?: boolean
  compact?: boolean
  className?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer gap-3 rounded-lg p-3 text-left transition-colors hover:bg-muted/70",
        selected && "bg-muted",
        compact &&
          "rounded-none border-b focus-visible:bg-muted/70 focus-visible:outline-none focus-visible:ring-0 last:border-b-0",
        className
      )}
    >
      <span className="relative mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <HugeiconsIcon
          icon={icons[notification.type]}
          strokeWidth={2}
          className="size-4"
        />
        {!notification.readAt && (
          <span className="absolute -top-0.5 -left-0.5 size-2.5 animate-pulse rounded-full border-2 border-background bg-primary" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {notification.pinned && (
            <HugeiconsIcon
              icon={Pin02Icon}
              strokeWidth={2}
              className="size-3 shrink-0 text-muted-foreground"
            />
          )}
          <span className="line-clamp-1 text-sm font-medium">
            {notification.title}
          </span>
        </span>
        {notification.body && (
          <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
            {notification.body}
          </span>
        )}
        <span className="mt-1 block text-[10px] text-muted-foreground">
          {formatRelativeTime(notification.created)}
        </span>
      </span>
    </button>
  )
}
