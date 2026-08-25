import type { ReactNode } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Calendar03Icon,
  CheckmarkCircle02Icon,
  File01Icon,
  TextAlignLeftIcon,
} from "@hugeicons/core-free-icons"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  formatTaskSpan,
  isOverdue,
  type DateLocale,
} from "@/lib/date-format"
import { cn } from "@/lib/utils"
import { PRIORITY_META, type Priority } from "@/store/board"

export type TaskCardLabel = {
  id?: string
  name: string
  color: string
}

export type TaskCardMember = {
  id?: string
  name: string
  avatar?: string
}

export type TaskCardContentProps = {
  title: string
  description?: string
  priority: Priority
  labels: TaskCardLabel[]
  /** Omitted on the public preview, where the team is shown as a whole. */
  members?: TaskCardMember[]
  startDate?: string
  dueDate?: string
  documentCount: number
  completed?: boolean
  /** Only the public preview varies this; the board always reads in English. */
  locale?: DateLocale
  /** Rendered next to the labels, e.g. the board's archive button. */
  action?: ReactNode
}

/**
 * The task card as it looks everywhere: on the board, where it is draggable
 * and archivable, and on a public project preview, where it is neither and
 * carries no assignees. Both render this same body so the two stay identical.
 */
export function TaskCardContent({
  title,
  description,
  priority,
  labels,
  members,
  startDate,
  dueDate,
  documentCount,
  completed,
  locale = "en",
  action,
}: TaskCardContentProps) {
  const priorityMeta = PRIORITY_META.find((item) => item.value === priority)
  const overdue = !completed && isOverdue(dueDate)
  const span = formatTaskSpan(startDate, dueDate, locale)

  return (
    <>
      {/* Labels + action */}
      {(labels.length > 0 || action) && (
        <div className="mb-2 flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1">
            {labels.map((label) => (
              <span
                key={label.id ?? label.name}
                className="inline-flex h-4.5 items-center rounded-md px-1.5 text-[10px] font-medium text-white"
                style={{ backgroundColor: label.color }}
              >
                {label.name}
              </span>
            ))}
          </div>
          {action}
        </div>
      )}

      {/* Title */}
      <p
        className={cn(
          "flex items-start gap-1.5 text-sm leading-snug font-medium",
          completed && "text-muted-foreground"
        )}
      >
        {completed && (
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            strokeWidth={2}
            className="mt-0.5 size-3.5 shrink-0 text-emerald-500"
          />
        )}
        {/* A long unbroken token would otherwise widen the whole card. */}
        <span className="min-w-0 break-words">{title}</span>
      </p>

      {/* Description indicator */}
      {description && (
        <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
          <HugeiconsIcon
            icon={TextAlignLeftIcon}
            strokeWidth={2}
            className="size-3"
          />
          <span className="truncate">{description}</span>
        </div>
      )}

      {/* Footer */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {/* Priority */}
          {priorityMeta && (
            <Badge
              variant="secondary"
              className="h-4.5 gap-1 px-1.5 text-[10px]"
              style={{ color: priorityMeta.color }}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: priorityMeta.color }}
              />
              {priorityMeta.label}
            </Badge>
          )}

          {/* Span */}
          {span && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-[10px]",
                overdue
                  ? "font-medium text-destructive"
                  : "text-muted-foreground"
              )}
            >
              <HugeiconsIcon
                icon={Calendar03Icon}
                strokeWidth={2}
                className="size-3"
              />
              {span}
            </span>
          )}

          {/* Linked documents */}
          {documentCount > 0 && (
            <span
              className="flex items-center gap-0.5 text-[10px] text-muted-foreground"
              title={`${documentCount} linked document${documentCount === 1 ? "" : "s"}`}
            >
              <HugeiconsIcon
                icon={File01Icon}
                strokeWidth={2}
                className="size-3"
              />
              {documentCount}
            </span>
          )}
        </div>

        {/* Members */}
        {members && members.length > 0 && (
          <div className="flex -space-x-1.5">
            {members.slice(0, 3).map((member) => (
              <Avatar
                key={member.id ?? member.name}
                size="sm"
                className="ring-2 ring-card"
              >
                {member.avatar && (
                  <AvatarImage
                    src={member.avatar}
                    alt={member.name}
                    className="object-cover"
                  />
                )}
                <AvatarFallback className="text-[9px]">
                  {member.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
            {members.length > 3 && (
              <div className="flex size-6 items-center justify-center rounded-full bg-muted text-[9px] text-muted-foreground ring-2 ring-card">
                +{members.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
