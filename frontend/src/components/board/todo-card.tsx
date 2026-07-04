import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { HugeiconsIcon } from "@hugeicons/react"
import { Calendar03Icon, TextAlignLeftIcon } from "@hugeicons/core-free-icons"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  PRIORITY_META,
  useBoardStore,
  type Todo,
} from "@/store/board"

type TodoCardProps = {
  todo: Todo
  onEdit: (todo: Todo) => void
}

function isOverdue(dueDate?: string) {
  if (!dueDate) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(dueDate) < today
}

function formatDate(dueDate: string) {
  const date = new Date(dueDate)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

export function TodoCard({ todo, onEdit }: TodoCardProps) {
  const labels = useBoardStore((s) => s.labels)
  const members = useBoardStore((s) => s.members)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: todo.id,
    data: {
      type: "todo",
      projectId: todo.projectId,
      stateId: todo.stateId,
    },
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  }

  const todoLabels = labels.filter((l) => todo.labels.includes(l.id))
  const todoMembers = members.filter(
    (member) =>
      member.projectId === todo.projectId && todo.members.includes(member.userId)
  )
  const priorityMeta = PRIORITY_META.find((p) => p.value === todo.priority)
  const overdue = isOverdue(todo.dueDate)

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onEdit(todo)}
      className={cn(
        "group/card cursor-pointer rounded-xl border border-border/60 bg-card p-3 shadow-sm transition-all hover:border-border hover:shadow-md",
        isDragging && "opacity-50 shadow-lg ring-2 ring-primary/20"
      )}
    >
      {/* Labels */}
      {todoLabels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {todoLabels.map((label) => (
            <span
              key={label.id}
              className="inline-flex h-4.5 items-center rounded-md px-1.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: label.color }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      {/* Title */}
      <p className="text-sm font-medium leading-snug">{todo.title}</p>

      {/* Description indicator */}
      {todo.description && (
        <div className="text-muted-foreground mt-1.5 flex items-center gap-1 text-xs">
          <HugeiconsIcon icon={TextAlignLeftIcon} strokeWidth={2} className="size-3" />
          <span className="truncate">{todo.description}</span>
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

          {/* Due date */}
          {todo.dueDate && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-[10px]",
                overdue ? "text-destructive font-medium" : "text-muted-foreground"
              )}
            >
              <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} className="size-3" />
              {formatDate(todo.dueDate)}
            </span>
          )}
        </div>

        {/* Members */}
        {todoMembers.length > 0 && (
          <div className="flex -space-x-1.5">
            {todoMembers.slice(0, 3).map((member) => (
              <Avatar
                key={member.id}
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
            {todoMembers.length > 3 && (
              <div className="bg-muted text-muted-foreground ring-2 ring-card flex size-6 items-center justify-center rounded-full text-[9px]">
                +{todoMembers.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
