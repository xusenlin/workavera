import { HugeiconsIcon } from "@hugeicons/react"
import {
  ChevronDownIcon,
  Edit01Icon,
  PlusSignIcon,
  KanbanIcon,
  Tag01Icon,
  UserGroupIcon,
  Layers01Icon,
} from "@hugeicons/core-free-icons"
import {
  CheckCircleIcon,
  CircleIcon,
  ClockIcon,
  XCircleIcon,
} from "lucide-react"
import type { DynamicToolUIPart } from "ai"
import type { ReactNode } from "react"
import { useNavigate } from "react-router"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { workspaceRecordUrl } from "@/lib/workspace-navigation"

type BoardMutationResult = {
  ok?: boolean
  action?: string
  resourceType?: string
  id?: string
  name?: string
  projectId?: string
}

/** Maps each mutation tool name to a display label and icon. */
const toolMeta: Record<
  string,
  { label: string; icon: typeof Edit01Icon }
> = {
  board_create_project: { label: "Create Project", icon: PlusSignIcon },
  board_update_project: { label: "Update Project", icon: Edit01Icon },
  board_upsert_state: { label: "Upsert State", icon: Layers01Icon },
  board_upsert_label: { label: "Upsert Label", icon: Tag01Icon },
  board_upsert_member: { label: "Upsert Member", icon: UserGroupIcon },
  board_create_task: { label: "Create Task", icon: PlusSignIcon },
  board_update_task: { label: "Update Task", icon: Edit01Icon },
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

function parseResult(output: unknown): BoardMutationResult | null {
  if (typeof output === "string") {
    try {
      return JSON.parse(output) as BoardMutationResult
    } catch {
      return null
    }
  }
  return output && typeof output === "object"
    ? (output as BoardMutationResult)
    : null
}

/** Long input values that should be truncated instead of shown in full. */
const longKeys = new Set([
  "html",
  "content",
  "find",
  "replace",
  "description",
])

function formatValue(key: string, value: unknown): string {
  if (Array.isArray(value)) {
    return value.length === 0 ? "[]" : value.join(", ")
  }
  if (typeof value === "string") {
    if (longKeys.has(key) && value.length > 80) {
      return `${value.slice(0, 80)}… (${value.length} chars)`
    }
    return value
  }
  if (value === null) return "null"
  if (value === undefined) return ""
  return String(value)
}

function formatInput(input: unknown): { key: string; value: string }[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return []
  return Object.entries(input as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([key, value]) => ({
      key: key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (c) => c.toUpperCase()),
      value: formatValue(key, value),
    }))
}

function actionText(result: BoardMutationResult): string {
  const action = result.action || "updated"
  const resource = result.resourceType || "resource"
  return `${action} ${resource}`
}

export function BoardMutationToolCard({ part }: { part: DynamicToolUIPart }) {
  const navigate = useNavigate()
  const result = parseResult(part.output)
  const loading =
    part.state === "input-streaming" || part.state === "input-available"
  const failed = part.state === "output-error" || result?.ok === false
  const meta = toolMeta[part.toolName] ?? {
    label: part.toolName.replace(/^board_/, "").replace(/_/g, " "),
    icon: KanbanIcon,
  }
  const params = formatInput(part.input)
  const targetId =
    result?.resourceType === "project" || result?.resourceType === "task"
      ? result.id
      : result?.projectId

  return (
    <Collapsible
      defaultOpen={true}
      className="group not-prose mb-4 w-full rounded-md border"
    >
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between gap-3 p-3",
          loading && "cursor-default"
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <HugeiconsIcon
            icon={meta.icon}
            strokeWidth={2}
            className={cn(
              "size-4 shrink-0",
              failed
                ? "text-destructive"
                : loading
                  ? "text-muted-foreground"
                  : "text-green-600"
            )}
          />
          <span className="text-sm font-medium">{meta.label}</span>
          {getStatusBadge(part.state)}
        </div>
        <HugeiconsIcon
          icon={ChevronDownIcon}
          strokeWidth={2}
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-2 p-4 pt-0 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2">
        {/* Parameters */}
        {params.length > 0 && (
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <div className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Parameters
            </div>
            <div className="space-y-0.5">
              {params.map((p) => (
                <div key={p.key} className="flex gap-2 text-xs">
                  <span className="shrink-0 font-medium text-muted-foreground">
                    {p.key}
                  </span>
                  <span className="min-w-0 break-words">{p.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ClockIcon className="size-3.5 animate-spin" />
              <span>Applying changes…</span>
            </div>
          </div>
        )}

        {/* Error */}
        {failed && !loading && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {part.errorText || "The change was not saved."}
          </div>
        )}

        {/* Success result */}
        {!loading && !failed && result && (
          <div className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <CheckCircleIcon className="size-4 shrink-0 text-green-600" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {result.name || "Resource"}{" "}
                  <span className="font-normal text-muted-foreground">
                    {actionText(result)}
                  </span>
                </p>
                {result.id && (
                  <p className="truncate text-xs text-muted-foreground tabular-nums">
                    {result.resourceType} · {result.id}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={() =>
                navigate(
                  targetId ? workspaceRecordUrl("board", targetId) : "/board"
                )
              }
            >
              Open Board
            </Button>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
