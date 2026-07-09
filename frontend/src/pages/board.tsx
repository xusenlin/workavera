import { useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, KanbanIcon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { KanbanBoard } from "@/components/board/kanban-board"
import { ProjectSheet } from "@/components/board/project-sheet"
import type { Project } from "@/store/board"

export function BoardPage() {
  const [projectSheetOpen, setProjectSheetOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)

  const handleAddProject = () => {
    setEditingProject(null)
    setProjectSheetOpen(true)
  }

  const handleEditProject = (project: Project) => {
    setEditingProject(project)
    setProjectSheetOpen(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <HugeiconsIcon
                icon={KanbanIcon}
                strokeWidth={2}
                className="size-4"
              />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Board</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage projects and tasks in a Kanban board. Drag cards between
            columns to update status.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={handleAddProject}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
          Add project
        </Button>
      </div>

      <KanbanBoard onEditProject={handleEditProject} />

      <ProjectSheet
        key={editingProject?.id || "new"}
        open={projectSheetOpen}
        onOpenChange={setProjectSheetOpen}
        project={editingProject}
      />
    </div>
  )
}
