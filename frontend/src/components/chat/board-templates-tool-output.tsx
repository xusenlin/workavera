import { HugeiconsIcon } from "@hugeicons/react"
import { ChevronDownIcon, LayoutGridIcon } from "@hugeicons/core-free-icons"
import {
  CheckCircleIcon,
  CircleIcon,
  ClockIcon,
  XCircleIcon,
} from "lucide-react"
import { useState } from "react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ToolInput } from "@/components/chat/tool-input"
import { cn } from "@/lib/utils"
import type { DynamicToolUIPart } from "ai"
import type { ReactNode } from "react"

type TemplateState = {
  name: string
  color: string
  category: string
}

type TemplateLabel = {
  name: string
  color: string
}

type TemplateSummary = {
  id: string
  name: string
  description?: string
  states: TemplateState[]
  labels: TemplateLabel[]
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

function parseTemplates(output: unknown): TemplateSummary[] {
  if (Array.isArray(output)) return output as TemplateSummary[]
  if (typeof output === "string") {
    try {
      const parsed = JSON.parse(output)
      return Array.isArray(parsed) ? (parsed as TemplateSummary[]) : []
    } catch {
      return []
    }
  }
  return []
}

function TemplateDetail({ template }: { template: TemplateSummary }) {
  return (
    <div className="rounded-md border bg-card">
      <div className="px-3 py-2">
        {/* Description */}
        {template.description && (
          <p className="mb-2 text-xs text-muted-foreground">
            {template.description}
          </p>
        )}

        {/* States */}
        {template.states.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              States
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {template.states.map((state, i) => (
                <div
                  key={`${state.name}-${i}`}
                  className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: state.color }}
                  />
                  <span className="text-xs font-medium">{state.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Labels */}
        {template.labels.length > 0 && (
          <div className="mt-2 space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Labels
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {template.labels.map((label, i) => (
                <div
                  key={`${label.name}-${i}`}
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
          </div>
        )}

        {/* Stats */}
        <div className="mt-2 text-xs text-muted-foreground tabular-nums">
          {template.states.length} states · {template.labels.length} labels
        </div>
      </div>
    </div>
  )
}

type BoardTemplatesToolPart = DynamicToolUIPart

export function BoardTemplatesToolCard({
  part,
}: {
  part: BoardTemplatesToolPart
}) {
  const templates = parseTemplates(part.output)
  const isError = part.state === "output-error"
  const isLoading =
    part.state === "input-streaming" || part.state === "input-available"
  const [activeTab, setActiveTab] = useState(templates[0]?.id ?? "")

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
            icon={LayoutGridIcon}
            strokeWidth={2}
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="text-sm font-medium">Project Templates</span>
          {templates.length > 0 && (
            <Badge variant="secondary" className="rounded-full px-1.5">
              {templates.length}
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
        <ToolInput input={part.input} />

        {isLoading && (
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ClockIcon className="size-3.5 animate-spin" />
              <span>Loading templates...</span>
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

        {/* Results */}
        {part.state === "output-available" && templates.length > 0 && (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="gap-2"
          >
            <div className="relative">
              <TabsList className="flex h-auto w-full [scrollbar-width:none] flex-nowrap justify-start overflow-x-auto [&::-webkit-scrollbar]:hidden">
                {templates.map((template) => (
                  <TabsTrigger
                    key={template.id}
                    value={template.id}
                    className="flex-none text-xs whitespace-nowrap"
                  >
                    {template.name}
                  </TabsTrigger>
                ))}
              </TabsList>
              <div className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-4xl bg-gradient-to-l from-muted to-transparent" />
            </div>
            {templates.map((template) => (
              <TabsContent key={template.id} value={template.id}>
                <TemplateDetail template={template} />
              </TabsContent>
            ))}
          </Tabs>
        )}

        {/* Empty result */}
        {part.state === "output-available" && templates.length === 0 && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            No templates found
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
