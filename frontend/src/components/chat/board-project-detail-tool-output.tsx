import { HugeiconsIcon } from "@hugeicons/react"
import { ChevronDownIcon, ViewIcon } from "@hugeicons/core-free-icons"
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { pb } from "@/lib/pocketbase"
import { ToolInput } from "@/components/chat/tool-input"
import { cn } from "@/lib/utils"
import { workspaceRecordUrl } from "@/lib/workspace-navigation"
import type { DynamicToolUIPart } from "ai"
import type { ReactNode } from "react"
import { useNavigate } from "react-router"

type ProjectState = {
  id: string
  name: string
  color: string
  category: string
  taskCount: number
}

type ProjectLabel = {
  id: string
  name: string
  color: string
}

type ProjectParticipant = {
  id: string
  name: string
  avatar?: string
  collectionId?: string
  role: string
  membershipId?: string
}

type ProjectCapabilities = {
  canEditProject: boolean
  canManageWorkflow: boolean
  canManageMembers: boolean
  canEditTasks: boolean
  canDeleteTasks: boolean
  canDeleteProject: boolean
}

type ProjectDetail = {
  id: string
  name: string
  description?: string
  archived: boolean
  owner: ProjectParticipant
  states: ProjectState[]
  labels?: ProjectLabel[]
  members?: ProjectParticipant[]
  participants?: ProjectParticipant[]
  currentActorRole: string
  capabilities: ProjectCapabilities
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

function parseProject(output: unknown): ProjectDetail | null {
  if (typeof output === "object" && output !== null && !Array.isArray(output)) {
    return output as ProjectDetail
  }
  if (typeof output === "string") {
    try {
      const parsed = JSON.parse(output)
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        return parsed as ProjectDetail
      }
    } catch {
      return null
    }
  }
  return null
}

function getInitials(name: string) {
  return name.charAt(0).toUpperCase()
}

function participantAvatarUrl(p: ProjectParticipant): string | undefined {
  if (!p.avatar || !p.collectionId) return undefined
  return pb.files.getURL({ id: p.id, collectionId: p.collectionId }, p.avatar)
}

function ParticipantChip({ participant }: { participant: ProjectParticipant }) {
  const src = participantAvatarUrl(participant)
  return (
    <div className="flex items-center gap-1.5 rounded-full border bg-card px-2 py-0.5">
      <Avatar size="sm">
        {src && <AvatarImage src={src} alt={participant.name} />}
        <AvatarFallback>{getInitials(participant.name)}</AvatarFallback>
      </Avatar>
      <span className="pr-1 text-xs font-medium">{participant.name}</span>
      {participant.role !== "owner" && (
        <span className="text-[10px] text-muted-foreground capitalize">
          {participant.role}
        </span>
      )}
    </div>
  )
}

const capabilityLabels: { key: keyof ProjectCapabilities; label: string }[] = [
  { key: "canEditProject", label: "Edit Project" },
  { key: "canManageWorkflow", label: "Manage Workflow" },
  { key: "canManageMembers", label: "Manage Members" },
  { key: "canEditTasks", label: "Edit Tasks" },
]

type BoardProjectDetailToolPart = DynamicToolUIPart

export function BoardProjectDetailToolCard({
  part,
}: {
  part: BoardProjectDetailToolPart
}) {
  const project = parseProject(part.output)
  const isError = part.state === "output-error"
  const isLoading =
    part.state === "input-streaming" || part.state === "input-available"
  const navigate = useNavigate()

  const totalTasks =
    project?.states.reduce((sum, s) => sum + s.taskCount, 0) ?? 0
  const members = project?.members ?? []

  return (
    <Collapsible
      defaultOpen={false}
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
            icon={ViewIcon}
            strokeWidth={2}
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="text-sm font-medium">Project Details</span>
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
        <ToolInput input={part.input} />

        {isLoading && (
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ClockIcon className="size-3.5 animate-spin" />
              <span>Loading project...</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-primary/60" />
            </div>
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {part.errorText || "Tool execution failed"}
          </div>
        )}

        {/* Result */}
        {part.state === "output-available" && project && (
          <div
            className="cursor-pointer space-y-3 rounded-md border bg-card transition-colors hover:border-border/80 hover:bg-muted/50"
            onClick={() => navigate(workspaceRecordUrl("board", project.id))}
          >
            <div className="px-3 py-2">
              {/* Name + archived + role + task count */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-medium">
                    {project.name}
                  </span>
                  {project.archived && (
                    <Badge variant="outline" className="text-xs font-normal">
                      Archived
                    </Badge>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  {project.currentActorRole && (
                    <Badge variant="secondary" className="capitalize">
                      {project.currentActorRole}
                    </Badge>
                  )}
                  <span className="tabular-nums">{totalTasks} tasks</span>
                </div>
              </div>

              {/* Description */}
              {project.description && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {project.description}
                </p>
              )}

              {/* States */}
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
                      <span className="text-xs font-medium">{state.name}</span>
                      {state.taskCount > 0 && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {state.taskCount}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Labels */}
              {project.labels && project.labels.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {project.labels.map((label) => (
                    <div
                      key={label.id}
                      className="flex items-center gap-1 rounded-full border px-2 py-0.5"
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: label.color }}
                      />
                      <span className="text-xs text-muted-foreground">
                        {label.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Participants */}
            {members.length > 0 && (
              <div className="border-t px-3 py-2">
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Members
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <ParticipantChip participant={project.owner} />
                  {members.map((m) => (
                    <ParticipantChip key={m.id} participant={m} />
                  ))}
                </div>
              </div>
            )}

            {/* Capabilities */}
            <div className="border-t px-3 py-2">
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                Your Capabilities
              </div>
              <div className="flex flex-wrap gap-1.5">
                {capabilityLabels.map(({ key, label }) => {
                  const enabled = project.capabilities[key]
                  return (
                    <div
                      key={key}
                      className={cn(
                        "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                        enabled
                          ? "border-transparent bg-green-500/10 text-green-700 dark:text-green-400"
                          : "text-muted-foreground line-through"
                      )}
                    >
                      {enabled && (
                        <CheckCircleIcon className="size-3 shrink-0" />
                      )}
                      {label}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Empty result */}
        {part.state === "output-available" && !project && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Project not found
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
