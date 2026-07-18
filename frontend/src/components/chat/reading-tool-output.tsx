import { HugeiconsIcon } from "@hugeicons/react"
import {
  ChevronDownIcon,
  BookOpen02Icon,
  Edit01Icon,
  File02Icon,
  MagicWand01Icon,
  SparklesIcon,
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
import { ToolInput } from "@/components/chat/tool-input"
import { cn } from "@/lib/utils"
import { workspaceRecordUrl } from "@/lib/workspace-navigation"
import { parseBatchToolResult } from "@/lib/tool-batch"

import { BatchToolResultSummary } from "./batch-tool-result"

type ReadingItem = {
  id: string
  title: string
  url: string
  description?: string
  projectId?: string
  status: string
  tags?: string[]
  summary?: string
  keyPoints?: string[]
  contentText?: string
  summaryLanguage?: string
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

function parseItems(output: unknown): ReadingItem[] {
  if (Array.isArray(output)) return output as ReadingItem[]
  if (typeof output === "string") {
    try {
      const parsed = JSON.parse(output)
      return Array.isArray(parsed) ? (parsed as ReadingItem[]) : []
    } catch {
      return []
    }
  }
  return []
}

function parseItem(output: unknown): ReadingItem | null {
  if (typeof output === "object" && output !== null && !Array.isArray(output)) {
    return output as ReadingItem
  }
  if (typeof output === "string") {
    try {
      const parsed = JSON.parse(output)
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        return parsed as ReadingItem
      }
    } catch {
      return null
    }
  }
  return null
}

const STATUS_COLORS: Record<string, string> = {
  unread: "#3b82f6",
  read: "#22c55e",
  archived: "#64748b",
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

// ── Search card ──────────────────────────────────────────────

export function ReadingSearchToolCard({ part }: { part: DynamicToolUIPart }) {
  const navigate = useNavigate()
  const items = parseItems(part.output)
  const isError = part.state === "output-error"
  const isLoading =
    part.state === "input-streaming" || part.state === "input-available"

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
            icon={BookOpen02Icon}
            strokeWidth={2}
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="text-sm font-medium">Reading List</span>
          {items.length > 0 && (
            <Badge variant="secondary" className="rounded-full px-1.5">
              {items.length}
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
        <ToolInput input={part.input} />

        {isLoading && (
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ClockIcon className="size-3.5 animate-spin" />
              <span>Searching reading list…</span>
            </div>
          </div>
        )}

        {isError && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {part.errorText || "Tool execution failed"}
          </div>
        )}

        {part.state === "output-available" && items.length > 0 && (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-md border bg-card transition-colors hover:border-border/80 hover:bg-muted/50"
              >
                <div className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            STATUS_COLORS[item.status] ?? "#64748b",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          navigate(workspaceRecordUrl("reading", item.id))
                        }
                        className="truncate text-left text-sm font-medium hover:underline"
                      >
                        {item.title}
                      </button>
                    </div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                      {hostname(item.url)}
                    </a>
                  </div>

                  {item.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  )}

                  {item.summary && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80">
                      {item.summary}
                    </p>
                  )}

                  {item.tags && item.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {part.state === "output-available" && items.length === 0 && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            No reading items found
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

// ── Single-item card (upsert / get / summarize) ──────────────

const itemToolMeta: Record<string, { label: string; icon: typeof Edit01Icon }> =
  {
    reading_upsert: { label: "Reading Item", icon: Edit01Icon },
    reading_get: { label: "Reading Item", icon: File02Icon },
    reading_summarize: { label: "Summarize Reading", icon: MagicWand01Icon },
  }

export function ReadingItemToolCard({ part }: { part: DynamicToolUIPart }) {
  const navigate = useNavigate()
  const isError = part.state === "output-error"
  const isLoading =
    part.state === "input-streaming" || part.state === "input-available"
  const meta = itemToolMeta[part.toolName] ?? {
    label: "Reading Item",
    icon: BookOpen02Icon,
  }
  const isSummarize = part.toolName === "reading_summarize"
  const isUpsert = part.toolName === "reading_upsert"
  const batch = isUpsert ? parseBatchToolResult<ReadingItem>(part.output) : null
  const item = batch ? null : parseItem(part.output)

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
            icon={meta.icon}
            strokeWidth={2}
            className={cn(
              "size-4 shrink-0",
              isSummarize ? "text-primary" : "text-muted-foreground"
            )}
          />
          <span className="text-sm font-medium">{meta.label}</span>
          {getStatusBadge(part.state)}
          {batch && <Badge variant="outline">{batch.total}</Badge>}
        </div>
        <HugeiconsIcon
          icon={ChevronDownIcon}
          strokeWidth={2}
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-3 p-4 pt-0 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2">
        <ToolInput input={part.input} />

        {isLoading && (
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ClockIcon className="size-3.5 animate-spin" />
              <span>
                {isSummarize
                  ? "Summarizing article…"
                  : isUpsert
                    ? "Saving reading item…"
                    : "Loading reading item…"}
              </span>
            </div>
            {isSummarize && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-primary/60" />
              </div>
            )}
          </div>
        )}

        {isError && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {part.errorText || "Tool execution failed"}
          </div>
        )}

        {part.state === "output-available" && batch && (
          <BatchToolResultSummary
            batch={batch}
            getLabel={(result) => result.title || result.id}
          />
        )}

        {part.state === "output-available" && item && (
          <div className="space-y-3 rounded-md border bg-card px-3 py-2">
            {/* Title + status + URL */}
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: STATUS_COLORS[item.status] ?? "#64748b",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      navigate(workspaceRecordUrl("reading", item.id))
                    }
                    className="truncate text-left text-sm font-medium hover:underline"
                  >
                    {item.title}
                  </button>
                </div>
                {isUpsert && (
                  <Badge variant="secondary" className="shrink-0 capitalize">
                    {item.id ? "Saved" : "Created"}
                  </Badge>
                )}
              </div>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 inline-block truncate text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                {hostname(item.url)}
              </a>
            </div>

            {/* Description */}
            {item.description && (
              <p className="text-xs text-muted-foreground">
                {item.description}
              </p>
            )}

            {/* Tags */}
            {item.tags && item.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Summary + key points */}
            {item.summary && (
              <div className="space-y-1.5 rounded-md bg-muted/30 px-2.5 py-2">
                <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <HugeiconsIcon
                    icon={SparklesIcon}
                    strokeWidth={2}
                    className="size-3.5 text-primary"
                  />
                  Summary
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {item.summary}
                </p>
                {item.keyPoints && item.keyPoints.length > 0 && (
                  <ul className="space-y-0.5 pl-3">
                    {item.keyPoints.map((point, i) => (
                      <li
                        key={i}
                        className="list-disc text-xs text-muted-foreground"
                      >
                        {point}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Full content (reading_get with includeContent) */}
            {item.contentText && (
              <Collapsible>
                <CollapsibleTrigger className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline">
                  Show full article
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-1 max-h-60 overflow-y-auto rounded-md border bg-muted/20 p-2.5 text-xs leading-relaxed text-muted-foreground">
                  <pre className="font-sans whitespace-pre-wrap">
                    {item.contentText}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}

        {part.state === "output-available" && !batch && !item && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Reading item not found
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
