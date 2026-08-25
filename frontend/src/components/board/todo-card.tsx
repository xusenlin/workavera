import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { HugeiconsIcon } from "@hugeicons/react"
import { Archive02Icon } from "@hugeicons/core-free-icons"

import { TaskCardContent } from "@/components/board/task-card-content"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { projectParticipants, useBoardStore, type Todo } from "@/store/board"

type TodoCardProps = {
  todo: Todo
  onEdit: (todo: Todo) => void
  onArchive?: (todo: Todo) => void
}

export function TodoCard({ todo, onEdit, onArchive }: TodoCardProps) {
  const labels = useBoardStore((s) => s.labels)
  const members = useBoardStore((s) => s.members)
  const projects = useBoardStore((s) => s.projects)

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
  const project = projects.find((item) => item.id === todo.projectId)
  const todoMembers = project
    ? projectParticipants(project, members)
        .filter((participant) => todo.members.includes(participant.userId))
        .map((participant) => ({
          id: participant.userId,
          name: participant.name,
          avatar: participant.avatar,
        }))
    : []

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
      <TaskCardContent
        title={todo.title}
        description={todo.description}
        priority={todo.priority}
        labels={todoLabels}
        members={todoMembers}
        startDate={todo.startDate}
        dueDate={todo.dueDate}
        documentCount={todo.documents.length}
        action={
          onArchive && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="-mt-1 -mr-1 shrink-0 text-muted-foreground opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Archive ${todo.title}`}
              title="Archive task"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onArchive(todo)
              }}
            >
              <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} />
            </Button>
          )
        }
      />
    </div>
  )
}
