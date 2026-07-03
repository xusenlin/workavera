import { useState } from "react"

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"

import { useBoardStore, type Todo, type TodoStatus } from "@/store/board"
import { ProjectColumn } from "./project-column"
import { TodoCard } from "./todo-card"
import { TodoCardSheet } from "./todo-card-sheet"

export function KanbanBoard() {
  const projects = useBoardStore((s) => s.projects)
  const todos = useBoardStore((s) => s.todos)
  const moveTodo = useBoardStore((s) => s.moveTodo)

  const [activeTodo, setActiveTodo] = useState<Todo | null>(null)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [addStatus, setAddStatus] = useState<TodoStatus>("todo")
  const [addProjectId, setAddProjectId] = useState("")

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const handleDragStart = (event: DragStartEvent) => {
    const todo = todos.find((t) => t.id === event.active.id)
    setActiveTodo(todo ?? null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTodo(null)

    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const draggedTodo = todos.find((t) => t.id === activeId)
    if (!draggedTodo) return

    // Determine target status and index from the over.id
    // over.id can be either a droppable column id ("projectId__status")
    // or a sortable todo id
    if (overId.includes("__")) {
      // Dropped on a column (empty area or directly on the droppable)
      const [, toStatus] = overId.split("__") as [string, TodoStatus]
      const columnTodos = todos
        .filter(
          (t) =>
            t.projectId === draggedTodo.projectId &&
            t.status === toStatus &&
            t.id !== activeId
        )
        .sort((a, b) => a.order - b.order)
      moveTodo(activeId, toStatus, columnTodos.length)
    } else {
      // Dropped on another todo card
      const overTodo = todos.find((t) => t.id === overId)
      if (!overTodo) return

      const toStatus = overTodo.status
      const columnTodos = todos
        .filter(
          (t) =>
            t.projectId === overTodo.projectId &&
            t.status === toStatus &&
            t.id !== activeId
        )
        .sort((a, b) => a.order - b.order)

      const overIndex = columnTodos.findIndex((t) => t.id === overId)
      moveTodo(activeId, toStatus, overIndex)
    }
  }

  const handleAddTask = (projectId: string, status: TodoStatus) => {
    setAddProjectId(projectId)
    setAddStatus(status)
    setEditingTodo(null)
    setSheetOpen(true)
  }

  const handleEditTask = (todo: Todo) => {
    setEditingTodo(todo)
    setSheetOpen(true)
  }

  return (
    <>
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
              todos={todos}
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

      <TodoCardSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        todo={editingTodo}
        projectId={addProjectId}
        defaultStatus={addStatus}
      />
    </>
  )
}
