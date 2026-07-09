import { cn } from "@/lib/utils"

type ToolInputProps = {
  input: unknown
  className?: string
}

export function ToolInput({ input, className }: ToolInputProps) {
  const formatted = formatInput(input)
  if (!formatted) return null

  return (
    <code
      className={cn(
        "block overflow-x-auto rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs text-muted-foreground",
        className
      )}
    >
      {formatted}
    </code>
  )
}

function formatInput(input: unknown): string {
  if (input === null || input === undefined) return ""
  if (typeof input === "string") return trimLong(input)
  if (typeof input !== "object") return trimLong(String(input))
  if (Array.isArray(input)) return trimLong(JSON.stringify(input))

  const entries = Object.entries(input as Record<string, unknown>)
  if (entries.length === 0) return ""
  return entries
    .map(([key, value]) => `${key.toUpperCase()}=${formatValue(key, value)}`)
    .join("  ")
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return ""
  if (Array.isArray(value)) return value.join(",")
  if (typeof value === "object") return trimLong(JSON.stringify(value))
  if (typeof value !== "string") return String(value)

  const normalizedKey = key.toLowerCase()
  if (["html", "content", "find", "replace"].includes(normalizedKey)) {
    return value.length > 120 ? `<${value.length} chars hidden>` : value
  }
  return trimLong(value)
}

function trimLong(value: string): string {
  return value.length > 160 ? value.slice(0, 160) + `... (${value.length} chars)` : value
}
