import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"

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
import { workspaceRecordUrl } from "@/lib/workspace-navigation"
import { useBoardStore, type Todo, type Project } from "@/store/board"
import { ProjectColumn } from "./project-column"
import { TodoCard } from "./todo-card"
import { TodoCardSheet } from "./todo-card-sheet"

type KanbanBoardProps = {
  onEditProject?: (project: Project) => void
  requestedTaskId?: string
}

export function KanbanBoard({
  onEditProject,
  requestedTaskId,
}: KanbanBoardProps) {
  const navigate = useNavigate()
  const projects = useBoardStore((store) => store.projects)
  const projectPage = useBoardStore((store) => store.projectPage)
  const projectTotalPages = useBoardStore((store) => store.projectTotalPages)
  const projectTotalItems = useBoardStore((store) => store.projectTotalItems)
  const states = useBoardStore((store) => store.states)
  const todos = useBoardStore((store) => store.todos)
  const openedTask = useBoardStore((store) => store.openedTask)
  const openedProject = useBoardStore((store) => store.openedProject)
  const loading = useBoardStore((store) => store.loading)
  const initialized = useBoardStore((store) => store.initialized)
  const error = useBoardStore((store) => store.error)
  const initialize = useBoardStore((store) => store.initialize)
  const dispose = useBoardStore((store) => store.dispose)
  const clearError = useBoardStore((store) => store.clearError)
  const clearOpenedRecord = useBoardStore((store) => store.clearOpenedRecord)
  const loadProjectPage = useBoardStore((store) => store.loadProjectPage)
  const moveTodo = useBoardStore((store) => store.moveTodo)

  const [activeTodo, setActiveTodo] = useState<Todo | null>(null)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [addStateId, setAddStateId] = useState("")
  const [addProjectId, setAddProjectId] = useState("")
  const openedRequestedTask = useRef<string | null>(null)

  useEffect(() => {
    void initialize()
    return dispose
  }, [dispose, initialize])

  useEffect(() => {
    if (
      !initialized ||
      !requestedTaskId ||
      openedRequestedTask.current === requestedTaskId
    ) {
      return
    }
    const requestedTask =
      todos.find((todo) => todo.id === requestedTaskId) ??
      (openedTask?.id === requestedTaskId ? openedTask : null)
    if (!requestedTask) return
    openedRequestedTask.current = requestedTaskId
    const frame = requestAnimationFrame(() => {
      setAddProjectId(requestedTask.projectId)
      setAddStateId(requestedTask.stateId)
      setEditingTodo(requestedTask)
      setSheetOpen(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [initialized, openedTask, requestedTaskId, todos])

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
      .filter(
        (todo) => todo.stateId === targetStateId && todo.id !== dragged.id
      )
      .sort((a, b) => a.rank - b.rank)
    const overIndex =
      over.data.current?.type === "todo"
        ? targetTodos.findIndex((todo) => todo.id === over.id)
        : targetTodos.length

    void moveTodo(dragged.id, targetStateId, Math.max(0, overIndex)).catch(
      () => {}
    )
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
    navigate(workspaceRecordUrl("board", todo.id), { replace: true })
  }

  const handleTaskSheetOpenChange = (open: boolean) => {
    setSheetOpen(open)
    if (!open && editingTodo) {
      clearOpenedRecord()
      navigate("/board", { replace: true })
    }
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
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={clearError}>
            Dismiss
          </Button>
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
              onEditProject={onEditProject}
            />
          ))}

          {projects.length === 0 && initialized && (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-8 text-center">
              <p className="text-sm font-medium">No projects yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
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

      {projectTotalPages > 0 && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {projectTotalItems} project{projectTotalItems === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={projectPage === 0 || loading}
              onClick={() => void loadProjectPage(projectPage - 1)}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {projectPage + 1} / {projectTotalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={projectPage >= projectTotalPages - 1 || loading}
              onClick={() => void loadProjectPage(projectPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <TodoCardSheet
        key={`${sheetOpen ? "open" : "closed"}:${editingTodo?.id || "new"}:${addStateId}`}
        open={sheetOpen}
        onOpenChange={handleTaskSheetOpenChange}
        todo={editingTodo}
        project={
          openedTask?.id === editingTodo?.id ? (openedProject ?? undefined) : undefined
        }
        projectId={addProjectId}
        defaultStateId={addStateId}
      />
    </>
  )
}
