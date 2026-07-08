import { useEffect, useState } from "react"

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useBoardStore, type Todo } from "@/store/board"
import { ProjectColumn } from "./project-column"
import { TodoCard } from "./todo-card"
import { TodoCardSheet } from "./todo-card-sheet"

export function KanbanBoard() {
  const projects = useBoardStore((store) => store.projects)
  const states = useBoardStore((store) => store.states)
  const todos = useBoardStore((store) => store.todos)
  const loading = useBoardStore((store) => store.loading)
  const initialized = useBoardStore((store) => store.initialized)
  const error = useBoardStore((store) => store.error)
  const initialize = useBoardStore((store) => store.initialize)
  const dispose = useBoardStore((store) => store.dispose)
  const clearError = useBoardStore((store) => store.clearError)
  const moveTodo = useBoardStore((store) => store.moveTodo)

  const [activeTodo, setActiveTodo] = useState<Todo | null>(null)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [addStateId, setAddStateId] = useState("")
  const [addProjectId, setAddProjectId] = useState("")

  useEffect(() => {
    void initialize()
    return dispose
  }, [dispose, initialize])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTodo(todos.find((todo) => todo.id === event.active.id) ?? null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTodo(null)
    if (!over) return

    const dragged = todos.find((todo) => todo.id === active.id)
    if (!dragged) return

    const targetProjectId = over.data.current?.projectId as string | undefined
    const targetStateId = over.data.current?.stateId as string | undefined
    if (!targetStateId || targetProjectId !== dragged.projectId) return

    const targetTodos = todos
      .filter((todo) => todo.stateId === targetStateId && todo.id !== dragged.id)
      .sort((a, b) => a.rank - b.rank)
    const overIndex = over.data.current?.type === "todo"
      ? targetTodos.findIndex((todo) => todo.id === over.id)
      : targetTodos.length

    void moveTodo(dragged.id, targetStateId, Math.max(0, overIndex)).catch(() => {})
  }

  const handleAddTask = (projectId: string, stateId: string) => {
    setAddProjectId(projectId)
    setAddStateId(stateId)
    setEditingTodo(null)
    setSheetOpen(true)
  }

  const handleEditTask = (todo: Todo) => {
    setAddProjectId(todo.projectId)
    setAddStateId(todo.stateId)
    setEditingTodo(todo)
    setSheetOpen(true)
  }

  if (loading && !initialized) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  return (
    <>
      {error && (
        <div className="border-destructive/30 bg-destructive/5 text-destructive mb-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={clearError}>Dismiss</Button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveTodo(null)}
      >
        <div className="flex flex-col gap-6">
          {projects.map((project) => (
            <ProjectColumn
              key={project.id}
              project={project}
              states={states}
              todos={todos}
              onAddTask={handleAddTask}
              onEditTask={handleEditTask}
            />
          ))}

          {projects.length === 0 && initialized && (
            <div className="bg-muted/20 flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
              <p className="text-sm font-medium">No projects yet</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Create a project from a template to start planning work.
              </p>
            </div>
          )}
        </div>

        <DragOverlay>
          {activeTodo ? (
            <div className="w-72 rotate-3 opacity-80">
              <TodoCard todo={activeTodo} onEdit={() => {}} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <TodoCardSheet
        key={`${sheetOpen ? "open" : "closed"}:${editingTodo?.id || "new"}:${addStateId}`}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        todo={editingTodo}
        projectId={addProjectId}
        defaultStateId={addStateId}
      />
    </>
  )
}
