import { HugeiconsIcon } from "@hugeicons/react"
import {
  ChevronDownIcon,
  KanbanIcon,
} from "@hugeicons/core-free-icons"
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
import { cn } from "@/lib/utils"
import type { DynamicToolUIPart } from "ai"
import type { ReactNode } from "react"
import { useNavigate } from "react-router"

type StateSummary = {
  id: string
  name: string
  color: string
  category: string
  taskCount: number
}

type ProjectSummary = {
  id: string
  name: string
  description?: string
  archived: boolean
  states: StateSummary[]
}

type BoardProjectsInput = {
  query?: string
  includeArchived?: boolean
  limit?: number
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

function parseProjects(output: unknown): ProjectSummary[] {
  if (Array.isArray(output)) return output as ProjectSummary[]
  if (typeof output === "string") {
    try {
      const parsed = JSON.parse(output)
      return Array.isArray(parsed) ? (parsed as ProjectSummary[]) : []
    } catch {
      return []
    }
  }
  return []
}

type BoardProjectsToolPart = DynamicToolUIPart

export function BoardProjectsToolCard({
  part,
}: {
  part: BoardProjectsToolPart
}) {
  const projects = parseProjects(part.output)
  const input = (part.input ?? {}) as BoardProjectsInput
  const isError = part.state === "output-error"
  const isLoading =
    part.state === "input-streaming" || part.state === "input-available"
  const navigate = useNavigate()

  const totalTasks = projects.reduce(
    (sum, p) => sum + p.states.reduce((s, st) => s + st.taskCount, 0),
    0
  )

  return (
    <Collapsible
      defaultOpen={true}
      className="group not-prose mb-4 w-full rounded-md border"
    >
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between gap-4 p-3",
          isLoading && "cursor-default"
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <HugeiconsIcon
            icon={KanbanIcon}
            strokeWidth={2}
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="text-sm font-medium">Projects</span>
          {projects.length > 0 && (
            <Badge variant="secondary" className="rounded-full px-1.5">
              {projects.length}
            </Badge>
          )}
          {getStatusBadge(part.state)}
        </div>
        <HugeiconsIcon
          icon={ChevronDownIcon}
          strokeWidth={2}
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-3 p-4 pt-0 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2">
        {/* Parameters */}
        {(input.query || input.includeArchived || input.limit) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium tracking-wide uppercase">Query</span>
            {input.query && (
              <Badge variant="outline" className="font-normal">
                {input.query}
              </Badge>
            )}
            {input.includeArchived && (
              <Badge variant="outline" className="font-normal">
                archived
              </Badge>
            )}
            {input.limit && (
              <Badge variant="outline" className="font-normal">
                limit {input.limit}
              </Badge>
            )}
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {part.errorText || "Tool execution failed"}
          </div>
        )}

        {/* Results */}
        {part.state === "output-available" && projects.length > 0 && (
          <div className="space-y-2">
            {projects.map((project) => {
              const projectTasks = project.states.reduce(
                (s, st) => s + st.taskCount,
                0
              )
              return (
                <div
                  key={project.id}
                  className="cursor-pointer rounded-md border bg-card transition-colors hover:border-border/80 hover:bg-muted/50"
                  onClick={() => navigate("/board")}
                >
                  <div className="px-3 py-2">
                    {/* Project name + total tasks */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-medium">
                          {project.name}
                        </span>
                        {project.archived && (
                          <Badge
                            variant="outline"
                            className="font-normal text-xs"
                          >
                            Archived
                          </Badge>
                        )}
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {projectTasks} tasks
                      </span>
                    </div>

                    {/* Description */}
                    {project.description && (
                      <p className="text-muted-foreground mt-0.5 truncate text-xs">
                        {project.description}
                      </p>
                    )}

                    {/* States in one row */}
                    {project.states.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {project.states.map((state) => (
                          <div
                            key={state.id}
                            className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"
                          >
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: state.color }}
                            />
                            <span className="text-xs font-medium">
                              {state.name}
                            </span>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {state.taskCount}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Summary */}
            <div className="flex items-center gap-3 px-1 text-xs text-muted-foreground">
              <span>{projects.length} projects</span>
              <span>·</span>
              <span>{totalTasks} tasks</span>
            </div>
          </div>
        )}

        {/* Empty result */}
        {part.state === "output-available" && projects.length === 0 && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            No projects found
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
