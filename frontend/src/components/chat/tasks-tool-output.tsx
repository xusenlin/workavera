import { useEffect, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  Task01Icon,
} from "@hugeicons/core-free-icons"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  CheckCircleIcon,
  CircleIcon,
  ClockIcon,
  XCircleIcon,
} from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StatusColumn } from "@/components/board/status-column"
import { TodoCard } from "@/components/board/todo-card"
import { TodoCardSheet } from "@/components/board/todo-card-sheet"
import { useBoardStore, type Todo } from "@/store/board"
import { cn } from "@/lib/utils"
import type { DynamicToolUIPart } from "ai"
import type { ReactNode } from "react"
import { useNavigate } from "react-router"

type TasksInput = {
  projectId?: string
  stateIds?: string[]
}

const statusLabels: Partial<Record<DynamicToolUIPart["state"], string>> = {
  "input-available": "Running",
  "input-streaming": "Pending",
  "output-available": "Completed",
  "output-error": "Error",
}

const statusIcons: Partial<Record<DynamicToolUIPart["state"], ReactNode>> = {
  "input-available": <ClockIcon className="size-4 animate-pulse" />,
  "input-streaming": <CircleIcon className="size-4" />,
  "output-available": <CheckCircleIcon className="size-4 text-green-600" />,
  "output-error": <XCircleIcon className="size-4 text-red-600" />,
}

function getStatusBadge(state: DynamicToolUIPart["state"]) {
  const icon = statusIcons[state]
  const label = statusLabels[state]
  if (!icon || !label) return null
  return (
    <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
      {icon}
      {label}
    </Badge>
  )
}

type TasksToolPart = DynamicToolUIPart

export function TasksToolCard({ part }: { part: TasksToolPart }) {
  const input = (part.input ?? {}) as TasksInput
  const projectId = input.projectId ?? ""
  const isError = part.state === "output-error"
  const isLoading =
    part.state === "input-streaming" || part.state === "input-available"
  const navigate = useNavigate()

  // Board store — initialize once to populate states/todos/labels/members.
  const states = useBoardStore((s) => s.states)
  const todos = useBoardStore((s) => s.todos)
  const initialize = useBoardStore((s) => s.initialize)
  const dispose = useBoardStore((s) => s.dispose)
  const moveTodo = useBoardStore((s) => s.moveTodo)

  useEffect(() => {
    void initialize()
    return dispose
  }, [dispose, initialize])

  // Filter to this project, optionally by stateIds.
  const projectStates = states
    .filter((s) => s.projectId === projectId)
    .filter((s) => !input.stateIds?.length || input.stateIds.includes(s.id))
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const projectTodos = todos.filter((t) => t.projectId === projectId)

  // DnD — same logic as KanbanBoard, restricted to this project.
  const [activeTodo, setActiveTodo] = useState<Todo | null>(null)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [addStateId, setAddStateId] = useState("")

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTodo(
      projectTodos.find((todo) => todo.id === event.active.id) ?? null
    )
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTodo(null)
    if (!over) return

    const dragged = projectTodos.find((todo) => todo.id === active.id)
    if (!dragged) return

    const targetProjectId = over.data.current?.projectId as string | undefined
    const targetStateId = over.data.current?.stateId as string | undefined
    if (!targetStateId || targetProjectId !== dragged.projectId) return

    const targetTodos = projectTodos
      .filter((todo) => todo.stateId === targetStateId && todo.id !== dragged.id)
      .sort((a, b) => a.rank - b.rank)
    const overIndex = over.data.current?.type === "todo"
      ? targetTodos.findIndex((todo) => todo.id === over.id)
      : targetTodos.length

    void moveTodo(dragged.id, targetStateId, Math.max(0, overIndex))
  }

  const handleAddTask = (stateId: string) => {
    setAddStateId(stateId)
    setEditingTodo(null)
    setSheetOpen(true)
  }

  const handleEditTask = (todo: Todo) => {
    setAddStateId(todo.stateId)
    setEditingTodo(todo)
    setSheetOpen(true)
  }

  return (
    <Collapsible
      defaultOpen={true}
      className="group not-prose mb-4 w-full min-w-0 rounded-md border"
    >
      <div className="flex w-full items-center justify-between gap-4 p-3">
        <CollapsibleTrigger
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2",
            isLoading && "cursor-default"
          )}
        >
          <HugeiconsIcon
            icon={Task01Icon}
            strokeWidth={2}
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="text-sm font-medium">Tasks</span>
          {part.state === "output-available" && projectTodos.length > 0 && (
            <Badge variant="secondary" className="rounded-full px-1.5">
              {projectTodos.length}
            </Badge>
          )}
          {getStatusBadge(part.state)}
          <HugeiconsIcon
            icon={ChevronDownIcon}
            strokeWidth={2}
            className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
          />
        </CollapsibleTrigger>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Open board"
          onClick={() => navigate("/board")}
        >
          <HugeiconsIcon icon={ArrowUpRightIcon} strokeWidth={2} className="size-4" />
        </Button>
      </div>

      <CollapsibleContent className="outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2">
        {/* Error */}
        {isError && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {part.errorText || "Tool execution failed"}
          </div>
        )}

        {/* Results — reuse board's StatusColumn + TodoCard + DnD */}
        {part.state === "output-available" && (
          <div className="min-w-0 p-3">
            {projectStates.length > 0 ? (
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setActiveTodo(null)}
              >
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {projectStates.map((state) => (
                    <StatusColumn
                      key={state.id}
                      state={state}
                      todos={projectTodos
                        .filter((t) => t.stateId === state.id)
                        .sort((a, b) => a.rank - b.rank)}
                      onAddTask={handleAddTask}
                      onEditTask={handleEditTask}
                    />
                  ))}
                </div>

                <DragOverlay>
                  {activeTodo ? (
                    <div className="w-72 rotate-3 opacity-80">
                      <TodoCard todo={activeTodo} onEdit={() => {}} />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            ) : (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                No states found for this project
              </div>
            )}
          </div>
        )}
      </CollapsibleContent>

      <TodoCardSheet
        key={`${sheetOpen ? "open" : "closed"}:${editingTodo?.id || "new"}:${addStateId}`}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        todo={editingTodo}
        projectId={projectId}
        defaultStateId={addStateId}
      />
    </Collapsible>
  )
}
