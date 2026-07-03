import { HugeiconsIcon } from "@hugeicons/react"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  Delete02Icon,
  Layers02Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { STATUS_META, useBoardStore, type Project, type Todo, type TodoStatus } from "@/store/board"
import { StatusColumn } from "./status-column"

type ProjectColumnProps = {
  project: Project
  todos: Todo[]
  onAddTask: (projectId: string, status: TodoStatus) => void
  onEditTask: (todo: Todo) => void
}

export function ProjectColumn({
  project,
  todos,
  onAddTask,
  onEditTask,
}: ProjectColumnProps) {
  const toggleCollapse = useBoardStore((s) => s.toggleProjectCollapse)
  const removeProject = useBoardStore((s) => s.removeProject)

  const projectTodos = todos.filter((t) => t.projectId === project.id)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/50 p-4">
      {/* Project header */}
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
          <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-xs tabular-nums">
            {projectTodos.length}
          </span>
        </button>

        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Project options">
                <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant="destructive"
                onClick={() => removeProject(project.id)}
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                Delete project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Status columns */}
      <div
        className={cn(
          "flex gap-4 overflow-x-auto pb-2 transition-all",
          project.collapsed && "hidden"
        )}
      >
        {STATUS_META.map((status) => (
          <StatusColumn
            key={status.value}
            status={status.value}
            todos={projectTodos
              .filter((t) => t.status === status.value)
              .sort((a, b) => a.order - b.order)}
            projectId={project.id}
            onAddTask={(s) => onAddTask(project.id, s)}
            onEditTask={onEditTask}
          />
        ))}
      </div>
    </div>
  )
}
