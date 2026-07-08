import { useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  Delete02Icon,
  Layers02Icon,
  MoreHorizontalIcon,
  Settings02Icon,
  Tag01Icon,
  UserGroup02Icon,
} from "@hugeicons/core-free-icons"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  useBoardStore,
  type Project,
  type ProjectState,
  type Todo,
} from "@/store/board"
import { StatusColumn } from "./status-column"

type ProjectColumnProps = {
  project: Project
  states: ProjectState[]
  todos: Todo[]
  onAddTask: (projectId: string, stateId: string) => void
  onEditTask: (todo: Todo) => void
  onEditProject?: (project: Project) => void
}

export function ProjectColumn({
  project,
  states,
  todos,
  onAddTask,
  onEditTask,
  onEditProject,
}: ProjectColumnProps) {
  const toggleCollapse = useBoardStore((store) => store.toggleProjectCollapse)
  const removeProject = useBoardStore((store) => store.removeProject)
  const labels = useBoardStore((store) => store.labels)
  const members = useBoardStore((store) => store.members)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const projectTodos = todos.filter((todo) => todo.projectId === project.id)
  const projectStates = [...states]
    .filter((state) => state.projectId === project.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const projectLabels = labels.filter((label) => label.projectId === project.id)
  const projectMembers = members.filter((member) => member.projectId === project.id)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/50 p-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => toggleCollapse(project.id)}
          className="hover:bg-muted flex items-center gap-1.5 rounded-md px-1 py-1 transition-colors"
        >
          <HugeiconsIcon
            icon={project.collapsed ? ChevronRightIcon : ChevronDownIcon}
            strokeWidth={2}
            className="text-muted-foreground size-4"
          />
          <div className="bg-primary/10 text-primary flex size-6 items-center justify-center rounded-md">
            <HugeiconsIcon icon={Layers02Icon} strokeWidth={2} className="size-3.5" />
          </div>
          <span className="text-sm font-semibold">{project.name}</span>
          <span className="bg-muted text-muted-foreground flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs tabular-nums">
            <HugeiconsIcon icon={Layers02Icon} strokeWidth={2} className="size-3" />
            {projectTodos.length}
          </span>
          {projectLabels.length > 0 && (
            <span className="bg-muted text-muted-foreground flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs tabular-nums">
              <HugeiconsIcon icon={Tag01Icon} strokeWidth={2} className="size-3" />
              {projectLabels.length}
            </span>
          )}
          {projectMembers.length > 0 && (
            <span className="bg-muted text-muted-foreground flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs tabular-nums">
              <HugeiconsIcon icon={UserGroup02Icon} strokeWidth={2} className="size-3" />
              {projectMembers.length}
            </span>
          )}
        </button>

        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Project options">
                <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEditProject?.(project)}>
                <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} />
                Edit project
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                Delete project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {project.description && !project.collapsed && (
        <p className="text-muted-foreground px-1 text-xs">{project.description}</p>
      )}

      <div
        className={cn(
          "no-scrollbar flex gap-4 overflow-x-auto pb-2 transition-all",
          project.collapsed && "hidden"
        )}
      >
        {projectStates.map((state) => (
          <StatusColumn
            key={state.id}
            state={state}
            todos={projectTodos
              .filter((todo) => todo.stateId === state.id)
              .sort((a, b) => a.rank - b.rank)}
            onAddTask={(stateId) => onAddTask(project.id, stateId)}
            onEditTask={onEditTask}
          />
        ))}

        {projectStates.length === 0 && (
          <div className="bg-muted/20 flex min-h-32 w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center">
            <div>
              <p className="text-sm font-medium">This project has no workflow yet</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Add at least one state before creating tasks.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => onEditProject?.(project)}>
              Edit project
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{project.name}</strong> and all {projectTodos.length} task
              {projectTodos.length === 1 ? "" : "s"} inside it. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void removeProject(project.id).catch(() => {})}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
