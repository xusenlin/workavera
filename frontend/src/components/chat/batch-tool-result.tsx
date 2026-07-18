import { CheckCircleIcon, XCircleIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { BatchToolResult } from "@/lib/tool-batch"

export function BatchToolResultSummary<T>({
  batch,
  getLabel,
}: {
  batch: BatchToolResult<T>
  getLabel?: (result: T) => string | undefined
}) {
  return (
    <div className="space-y-2 rounded-md border bg-card px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <span>{batch.total} records</span>
        <Badge className="bg-green-500/10 text-green-700 dark:text-green-400">
          {batch.succeeded} succeeded
        </Badge>
        {batch.failed > 0 && (
          <Badge variant="destructive">{batch.failed} failed</Badge>
        )}
      </div>

      <div className="max-h-60 space-y-1 overflow-y-auto">
        {batch.results.map((item) => {
          const label = item.result ? getLabel?.(item.result) : undefined
          return (
            <div
              key={item.index}
              className="flex items-start gap-2 rounded bg-muted/30 px-2 py-1.5 text-xs"
            >
              {item.ok ? (
                <CheckCircleIcon className="mt-0.5 size-3.5 shrink-0 text-green-600" />
              ) : (
                <XCircleIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              )}
              <span className="min-w-0 break-words">
                {label || `Record ${item.index + 1}`}
                {!item.ok && item.error && (
                  <span className="text-destructive"> — {item.error}</span>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
