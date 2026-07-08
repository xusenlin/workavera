import { cn } from "@/lib/utils"

type ToolInputProps = {
  input: Record<string, unknown> | undefined
  className?: string
}

export function ToolInput({ input, className }: ToolInputProps) {
  if (!input || Object.keys(input).length === 0) return null

  return (
    <code
      className={cn(
        "block overflow-x-auto rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs text-muted-foreground",
        className
      )}
    >
      {Object.entries(input)
        .map(([key, value]) => `${key.toUpperCase()}=${formatValue(value)}`)
        .join("  ")}
    </code>
  )
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (Array.isArray(value)) return value.join(",")
  return String(value)
}
