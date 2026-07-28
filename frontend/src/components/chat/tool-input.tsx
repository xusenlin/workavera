import { CheckIcon, ChevronDownIcon, CopyIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

const MAX_PREVIEW_CHARS = 12_000
const MAX_STRING_CHARS = 2_000
const MAX_ARRAY_ITEMS = 10
const MAX_OBJECT_KEYS = 30
const MAX_DEPTH = 4
const MAX_NODES = 120

type ToolInputProps = {
  input: unknown
  className?: string
}

type PreviewContext = {
  nodes: number
  truncated: boolean
  seen: WeakSet<object>
}

type InputPreview = {
  text: string
  truncated: boolean
}

export function ToolInput({ input, className }: ToolInputProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimeout = useRef<number>(0)
  const summary = useMemo(() => formatSummary(input), [input])
  const preview = useMemo(
    () => (open ? formatPreview(input) : null),
    [input, open]
  )

  useEffect(
    () => () => {
      window.clearTimeout(copyTimeout.current)
    },
    []
  )

  if (!summary) return null

  const copyFullInput = async () => {
    if (!navigator.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(formatFullInput(input))
      setCopied(true)
      window.clearTimeout(copyTimeout.current)
      copyTimeout.current = window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn("overflow-hidden rounded-md border bg-muted/20", className)}
    >
      <div className="flex items-center gap-1">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left">
          <span className="shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Parameters
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {summary}
          </span>
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </CollapsibleTrigger>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="mr-1 shrink-0"
          aria-label="Copy full parameters"
          title="Copy full parameters"
          onClick={() => void copyFullInput()}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </div>

      <CollapsibleContent className="border-t">
        <pre className="max-h-80 overflow-auto px-3 py-2 font-mono text-xs break-words whitespace-pre-wrap text-foreground">
          {preview?.text}
        </pre>
        {preview?.truncated && (
          <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
            Preview limited to {MAX_PREVIEW_CHARS.toLocaleString()} characters,
            {` ${MAX_ARRAY_ITEMS}`} array items, and {MAX_DEPTH} levels. Copy to
            inspect the complete parameters.
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

function formatSummary(input: unknown): string {
  if (input === null) return "null"
  if (input === undefined) return ""
  if (typeof input === "string") return `${input.length} chars`
  if (typeof input !== "object") return String(input)
  if (Array.isArray(input)) return `${input.length} items`

  const entries = Object.entries(input as Record<string, unknown>)
  if (entries.length === 0) return ""
  const shown = entries
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${summarizeValue(value)}`)
  if (entries.length > shown.length) {
    shown.push(`+${entries.length - shown.length} fields`)
  }
  return shown.join(" · ")
}

function summarizeValue(value: unknown): string {
  if (value === null) return "null"
  if (value === undefined) return "undefined"
  if (Array.isArray(value)) return `${value.length} items`
  if (typeof value === "object") {
    return `${Object.keys(value as Record<string, unknown>).length} fields`
  }
  if (typeof value === "string") {
    if (value.length > 48) return `${value.length} chars`
    return JSON.stringify(value)
  }
  return String(value)
}

function formatPreview(input: unknown): InputPreview {
  const context: PreviewContext = {
    nodes: 0,
    truncated: false,
    seen: new WeakSet<object>(),
  }
  const value = toPreviewValue(input, 0, context)
  let text =
    typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? "")
  if (text.length > MAX_PREVIEW_CHARS) {
    text = `${text.slice(0, MAX_PREVIEW_CHARS)}\n… preview shortened`
    context.truncated = true
  }
  return { text, truncated: context.truncated }
}

function toPreviewValue(
  value: unknown,
  depth: number,
  context: PreviewContext
): unknown {
  if (context.nodes >= MAX_NODES) {
    context.truncated = true
    return "… preview node limit reached"
  }
  context.nodes++

  if (typeof value === "string") {
    if (value.length <= MAX_STRING_CHARS) return value
    context.truncated = true
    return `${value.slice(0, MAX_STRING_CHARS)}… [${value.length - MAX_STRING_CHARS} more chars]`
  }
  if (value === null || typeof value !== "object") return value
  if (context.seen.has(value)) return "[Circular]"
  context.seen.add(value)

  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) {
      context.truncated = true
      return `[Array(${value.length}) hidden at depth limit]`
    }
    const visible = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => toPreviewValue(item, depth + 1, context))
    if (value.length > visible.length) {
      context.truncated = true
      visible.push(`… ${value.length - visible.length} more items`)
    }
    return visible
  }

  const entries = Object.entries(value as Record<string, unknown>)
  if (depth >= MAX_DEPTH) {
    context.truncated = true
    return `[Object with ${entries.length} fields hidden at depth limit]`
  }
  const visibleEntries = entries.slice(0, MAX_OBJECT_KEYS)
  const result: Record<string, unknown> = {}
  for (const [key, item] of visibleEntries) {
    result[key] = toPreviewValue(item, depth + 1, context)
  }
  if (entries.length > visibleEntries.length) {
    context.truncated = true
    result["…"] = `${entries.length - visibleEntries.length} more fields`
  }
  return result
}

function formatFullInput(input: unknown): string {
  if (typeof input === "string") return input
  try {
    return JSON.stringify(input, null, 2) ?? String(input)
  } catch {
    return String(input)
  }
}
