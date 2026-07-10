import { HugeiconsIcon } from "@hugeicons/react"
import {
  AppWindowIcon,
  ArrowUpRightIcon,
  ChevronDownIcon,
  Edit01Icon,
  ViewIcon,
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
import { ToolInput } from "@/components/chat/tool-input"
import { cn } from "@/lib/utils"

type AIMicroAppSummary = {
  id: string
  name?: string
  description?: string
  appStatus?: string
  previewUrl?: string
  updated?: string
}

type AIMicroAppToolResult = AIMicroAppSummary & {
  ok?: boolean
  result?: string
  error?: string
  items?: AIMicroAppSummary[]
  replacements?: number
  sourceLength?: number
}

const toolNames = new Set([
  "microapps_create",
  "microapps_update",
  "microapps_get",
  "microapps_list",
  "microapps_search",
  "microapps_replace",
  "microapps_write_chunk",
])

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

function isAIMicroAppToolName(toolName: string) {
  return toolNames.has(toolName)
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

function parseResult(output: unknown): AIMicroAppToolResult | null {
  const data = typeof output === "string" ? safeJsonParse(output) : output
  if (data && typeof data === "object") {
    return data as AIMicroAppToolResult
  }
  return null
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function appsFromResult(
  result: AIMicroAppToolResult | null
): AIMicroAppSummary[] {
  if (!result) return []
  if (Array.isArray(result.items)) return result.items
  if (result.id) return [result]
  return []
}

function previewUrlFor(app: AIMicroAppSummary) {
  return app.previewUrl || `/api/ai-micro-apps/${app.id}/preview`
}

function isMutationTool(toolName: string) {
  return (
    toolName === "microapps_replace" ||
    toolName === "microapps_write_chunk"
  )
}

function mutationSummary(
  toolName: string,
  result: AIMicroAppToolResult | null
) {
  if (toolName === "microapps_replace") {
    const count = result?.replacements ?? 0
    return count === 1 ? "Replaced 1 match" : `Replaced ${count} matches`
  }
  if (toolName === "microapps_write_chunk") {
    return result?.sourceLength
      ? `Saved source, ${result.sourceLength} chars total`
      : "Saved source chunk"
  }
  return "Updated micro app"
}

export function AIMicroAppsToolCard({ part }: { part: DynamicToolUIPart }) {
  const navigate = useNavigate()
  const result = parseResult(part.output)
  const apps = appsFromResult(result)
  const isError = part.state === "output-error" || result?.ok === false
  const isLoading =
    part.state === "input-streaming" || part.state === "input-available"
  const compactMutation = isMutationTool(part.toolName)

  if (!isAIMicroAppToolName(part.toolName)) return null

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
            icon={AppWindowIcon}
            strokeWidth={2}
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="text-sm font-medium">AI Micro Apps</span>
          {apps.length > 0 ? (
            <Badge variant="secondary" className="rounded-full px-1.5">
              {apps.length}
            </Badge>
          ) : null}
          {getStatusBadge(part.state)}
        </div>
        <HugeiconsIcon
          icon={ChevronDownIcon}
          strokeWidth={2}
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-3 p-4 pt-0 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2">
        {!compactMutation ? <ToolInput input={part.input} /> : null}

        {isLoading ? (
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ClockIcon className="size-3.5 animate-spin" />
              <span>Working on micro app...</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-primary/60" />
            </div>
          </div>
        ) : null}

        {isError ? (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {part.errorText || result?.error || "Tool execution failed"}
          </div>
        ) : null}

        {part.state === "output-available" && compactMutation && !isError ? (
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {mutationSummary(part.toolName, result)}
              </p>
              {result?.id ? (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {result.name || "AI micro app"} · {result.id}
                </p>
              ) : null}
            </div>
            {result?.id ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/micro-apps?app=${result.id}`)}
              >
                <HugeiconsIcon icon={ViewIcon} strokeWidth={2} />
                Preview
              </Button>
            ) : null}
          </div>
        ) : null}

        {part.state === "output-available" &&
        apps.length > 0 &&
        !compactMutation ? (
          <div className="space-y-2">
            {apps.map((app) => (
              <div key={app.id} className="rounded-md border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {app.name || "Untitled micro app"}
                      </span>
                      {app.appStatus ? (
                        <Badge
                          variant="outline"
                          className="h-5 px-1.5 text-[10px]"
                        >
                          {app.appStatus}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {app.description || "Self-contained AI micro app"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={previewUrlFor(app)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <HugeiconsIcon icon={ArrowUpRightIcon} strokeWidth={2} />
                      Open
                    </a>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/micro-apps?app=${app.id}`)}
                  >
                    <HugeiconsIcon icon={ViewIcon} strokeWidth={2} />
                    Preview
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      sessionStorage.setItem("aiMicroAppEditId", app.id)
                      window.dispatchEvent(
                        new CustomEvent("ai-micro-app-edit", { detail: app.id })
                      )
                      navigate("/chat")
                    }}
                  >
                    <HugeiconsIcon icon={Edit01Icon} strokeWidth={2} />
                    Edit
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {part.state === "output-available" &&
        apps.length === 0 &&
        !isError &&
        !compactMutation ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            <HugeiconsIcon
              icon={AppWindowIcon}
              strokeWidth={2}
              className="size-6 opacity-50"
            />
            <div>
              <p className="font-medium text-foreground">No micro apps found</p>
              <p className="mt-1 text-xs">
                Create one first, or try a different search.
              </p>
            </div>
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  )
}
