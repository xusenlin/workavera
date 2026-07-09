import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"

import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ProjectState, Todo } from "@/store/board"
import { TodoCard } from "./todo-card"

type StatusColumnProps = {
  state: ProjectState
  todos: Todo[]
  onAddTask: (stateId: string) => void
  onEditTask: (todo: Todo) => void
}

export function StatusColumn({
  state,
  todos,
  onAddTask,
  onEditTask,
}: StatusColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `state:${state.id}`,
    data: { type: "state", projectId: state.projectId, stateId: state.id },
  })

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: state.color }}
          />
          <span className="text-sm font-semibold">{state.name}</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
            {todos.length}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onAddTask(state.id)}
          aria-label={`Add task to ${state.name}`}
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
        </Button>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "no-scrollbar flex max-h-[calc(100vh-24rem)] min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-xl bg-muted/30 p-2 transition-colors",
          isOver && "bg-primary/5 ring-1 ring-primary/20"
        )}
      >
        <SortableContext
          items={todos.map((todo) => todo.id)}
          strategy={verticalListSortingStrategy}
        >
          {todos.map((todo) => (
            <TodoCard key={todo.id} todo={todo} onEdit={onEditTask} />
          ))}
        </SortableContext>

        {todos.length === 0 && (
          <button
            onClick={() => onAddTask(state.id)}
            className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-4 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            + Add task
          </button>
        )}
      </div>
    </div>
  )
}
