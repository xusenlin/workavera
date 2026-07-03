import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"

import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { STATUS_META, type Todo, type TodoStatus } from "@/store/board"
import { TodoCard } from "./todo-card"

type StatusColumnProps = {
  status: TodoStatus
  todos: Todo[]
  projectId: string
  onAddTask: (status: TodoStatus) => void
  onEditTask: (todo: Todo) => void
}

export function StatusColumn({
  status,
  todos,
  projectId,
  onAddTask,
  onEditTask,
}: StatusColumnProps) {
  const meta = STATUS_META.find((s) => s.value === status)!
  const droppableId = `${projectId}__${status}`

  const { setNodeRef, isOver } = useDroppable({ id: droppableId })

  return (
    <div className="flex w-72 shrink-0 flex-col">
      {/* Column header */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: meta.color }}
          />
          <span className="text-sm font-semibold">{meta.label}</span>
          <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-xs tabular-nums">
            {todos.length}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onAddTask(status)}
          aria-label={`Add task to ${meta.label}`}
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
        </Button>
      </div>

      {/* Cards container */}
      <div
        ref={setNodeRef}
        className={cn(
          "bg-muted/30 flex max-h-[28rem] min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-xl p-2 transition-colors",
          isOver && "bg-primary/5 ring-1 ring-primary/20"
        )}
      >
        <SortableContext
          items={todos.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {todos.map((todo) => (
            <TodoCard key={todo.id} todo={todo} onEdit={onEditTask} />
          ))}
        </SortableContext>

        {todos.length === 0 && (
          <button
            onClick={() => onAddTask(status)}
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 flex flex-1 items-center justify-center rounded-lg border border-dashed py-4 text-xs transition-colors"
          >
            + Add task
          </button>
        )}
      </div>
    </div>
  )
}
