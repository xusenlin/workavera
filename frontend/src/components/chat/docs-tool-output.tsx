import { HugeiconsIcon } from "@hugeicons/react"
import {
  ChevronDownIcon,
  File02Icon,
  FileEditIcon,
  Search01Icon,
  ReplaceIcon,
  ArrowRight01Icon,
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

type Doc = {
  id: string
  title: string
  content: string
  ownerId: string
  projectId?: string
  projectName?: string
  status: string
  revision: number
  lastEditedBy: string
  created: string
  updated: string
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

function parseDocs(output: unknown): Doc[] {
  if (Array.isArray(output)) return output as Doc[]
  if (typeof output === "string") {
    try {
      const parsed = JSON.parse(output)
      return Array.isArray(parsed) ? (parsed as Doc[]) : []
    } catch {
      return []
    }
  }
  return []
}

function parseDoc(output: unknown): Doc | null {
  if (typeof output === "object" && output !== null && !Array.isArray(output)) {
    return output as Doc
  }
  if (typeof output === "string") {
    try {
      const parsed = JSON.parse(output)
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        return parsed as Doc
      }
    } catch {
      return null
    }
  }
  return null
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

// ── Search card ──────────────────────────────────────────────

export function DocsSearchToolCard({ part }: { part: DynamicToolUIPart }) {
  const docs = parseDocs(part.output)
  const isError = part.state === "output-error"
  const isLoading =
    part.state === "input-streaming" || part.state === "input-available"
  const navigate = useNavigate()

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
            icon={Search01Icon}
            strokeWidth={2}
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="text-sm font-medium">Documents</span>
          {docs.length > 0 && (
            <Badge variant="secondary" className="rounded-full px-1.5">
              {docs.length}
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
              <span>Searching documents…</span>
            </div>
          </div>
        )}

        {isError && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {part.errorText || "Tool execution failed"}
          </div>
        )}

        {part.state === "output-available" && docs.length > 0 && (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="cursor-pointer rounded-md border bg-card transition-colors hover:border-border/80 hover:bg-muted/50"
                onClick={() => navigate(workspaceRecordUrl("docs", doc.id))}
              >
                <div className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <HugeiconsIcon
                        icon={File02Icon}
                        strokeWidth={2}
                        className="size-3.5 shrink-0 text-muted-foreground"
                      />
                      <span className="truncate text-sm font-medium">
                        {doc.title}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {doc.projectName && (
                        <Badge variant="outline" className="text-[10px]">
                          {doc.projectName}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground tabular-nums">
                        R{doc.revision}
                      </span>
                    </div>
                  </div>

                  {doc.content && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {doc.content}
                    </p>
                  )}

                  <span className="mt-1 block text-[10px] text-muted-foreground/70">
                    {formatDate(doc.updated)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {part.state === "output-available" && docs.length === 0 && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            No documents found
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

// ── Single-doc card (get / upsert / replace) ─────────────────

const docToolMeta: Record<string, { label: string; icon: typeof File02Icon }> =
  {
    docs_get: { label: "Document", icon: File02Icon },
    docs_upsert: { label: "Upsert Document", icon: FileEditIcon },
    docs_replace: { label: "Replace Text", icon: ReplaceIcon },
  }

export function DocsItemToolCard({ part }: { part: DynamicToolUIPart }) {
  const navigate = useNavigate()
  const isError = part.state === "output-error"
  const isLoading =
    part.state === "input-streaming" || part.state === "input-available"
  const meta = docToolMeta[part.toolName] ?? {
    label: "Document",
    icon: File02Icon,
  }
  const isUpsert = part.toolName === "docs_upsert"
  const isReplace = part.toolName === "docs_replace"

  // docs_upsert updates and docs_replace wrap the document, while
  // docs_upsert creates return a bare document.
  const raw = part.output
  let doc: Doc | null = null
  let changed: boolean | undefined
  let matches: number | undefined
  const isWrapped = isUpsert || isReplace
  if (isWrapped) {
    const parsed = typeof raw === "string" ? safeParse(raw) : raw
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>
      if (obj.document && typeof obj.document === "object") {
        doc = obj.document as Doc
        changed = obj.changed as boolean | undefined
        matches = obj.matches as number | undefined
      } else if (isUpsert) {
        doc = parsed as Doc
      }
    }
  } else {
    doc = parseDoc(raw)
  }

  // For docs_upsert create path, the output is a bare Document
  const isCreate = isUpsert && doc && !changed && !matches && doc.revision === 1

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
            icon={meta.icon}
            strokeWidth={2}
            className={cn(
              "size-4 shrink-0",
              isCreate ? "text-green-600" : "text-muted-foreground"
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

      <CollapsibleContent className="space-y-3 p-4 pt-0 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2">
        <ToolInput input={part.input} />

        {isLoading && (
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ClockIcon className="size-3.5 animate-spin" />
              <span>
                {isReplace
                  ? "Replacing text…"
                  : isUpsert
                    ? "Saving document…"
                    : "Loading document…"}
              </span>
            </div>
          </div>
        )}

        {isError && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {part.errorText || "Tool execution failed"}
          </div>
        )}

        {part.state === "output-available" && doc && (
          <div className="space-y-3 rounded-md border bg-card px-3 py-2">
            {/* Title + meta row */}
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <HugeiconsIcon
                    icon={File02Icon}
                    strokeWidth={2}
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span className="truncate text-sm font-medium">
                    {doc.title}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {isReplace && matches !== undefined && (
                    <Badge className="bg-green-500/10 text-[10px] text-green-700 dark:text-green-400">
                      {matches} {matches === 1 ? "match" : "matches"}
                    </Badge>
                  )}
                  {isUpsert && changed === false && (
                    <Badge variant="secondary" className="text-[10px]">
                      No changes
                    </Badge>
                  )}
                  {isUpsert && changed === true && (
                    <Badge className="bg-green-500/10 text-[10px] text-green-700 dark:text-green-400">
                      Saved
                    </Badge>
                  )}
                  {isCreate && (
                    <Badge className="bg-green-500/10 text-[10px] text-green-700 dark:text-green-400">
                      Created
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    R{doc.revision}
                  </span>
                </div>
              </div>

              {/* Meta line */}
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                {doc.projectName && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5">
                    {doc.projectName}
                  </span>
                )}
                <span>Updated {formatDate(doc.updated)}</span>
              </div>
            </div>

            {/* Content preview */}
            {doc.content && (
              <Collapsible>
                <CollapsibleTrigger className="group/content text-xs font-medium text-muted-foreground underline-offset-2 hover:underline">
                  <span className="group-data-[state=open]/content:hidden">
                    Show Markdown content
                  </span>
                  <span className="hidden group-data-[state=open]/content:inline">
                    Hide Markdown content
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-1 max-h-72 overflow-y-auto rounded-md border bg-muted/20 p-2.5">
                  <pre className="font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-muted-foreground">
                    {doc.content}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Open in editor */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => navigate(workspaceRecordUrl("docs", doc.id))}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
              >
                Open in editor
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                  className="size-3"
                />
              </button>
            </div>
          </div>
        )}

        {part.state === "output-available" && !doc && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Document not found
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
