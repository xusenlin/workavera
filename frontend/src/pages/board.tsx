import { HugeiconsIcon } from "@hugeicons/react"
import { KanbanIcon } from "@hugeicons/core-free-icons"

import { KanbanBoard } from "@/components/board/kanban-board"
import { ProjectAddDialog } from "@/components/board/project-add-dialog"

export function BoardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
              <HugeiconsIcon icon={KanbanIcon} strokeWidth={2} className="size-4" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Board</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Manage projects and tasks in a Kanban board. Drag cards between
            columns to update status.
          </p>
        </div>
        <ProjectAddDialog />
      </div>

      <KanbanBoard />
    </div>
  )
}
