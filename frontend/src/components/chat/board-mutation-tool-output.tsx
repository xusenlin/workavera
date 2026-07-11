import {
  CheckCircleIcon,
  ClockIcon,
  LayoutDashboardIcon,
  XCircleIcon,
} from "lucide-react"
import type { DynamicToolUIPart } from "ai"
import { useNavigate } from "react-router"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type BoardMutationResult = {
  ok?: boolean
  action?: string
  resourceType?: string
  id?: string
  name?: string
  projectId?: string
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

export function BoardMutationToolCard({ part }: { part: DynamicToolUIPart }) {
  const navigate = useNavigate()
  const result = parseResult(part.output)
  const loading =
    part.state === "input-streaming" || part.state === "input-available"
  const failed = part.state === "output-error" || result?.ok === false

  return (
    <div className="not-prose mb-4 flex w-full items-center justify-between gap-3 rounded-md border bg-card px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {loading ? (
          <ClockIcon className="size-4 shrink-0 animate-pulse text-muted-foreground" />
        ) : failed ? (
          <XCircleIcon className="size-4 shrink-0 text-destructive" />
        ) : (
          <CheckCircleIcon className="size-4 shrink-0 text-green-600" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {loading
              ? "Updating Board…"
              : failed
                ? "Board update failed"
                : `${result?.name || "Board resource"} ${result?.action || "updated"}`}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {failed
              ? part.errorText || "The change was not saved."
              : result?.resourceType
                ? `${result.resourceType} · ${result.id || ""}`
                : "Waiting for the Board service"}
          </p>
        </div>
      </div>

      {!loading && !failed ? (
        <Button variant="ghost" size="sm" onClick={() => navigate("/board")}>
          <LayoutDashboardIcon className="size-4" />
          Open Board
        </Button>
      ) : (
        <Badge variant={failed ? "destructive" : "secondary"}>
          {failed ? "Error" : "Running"}
        </Badge>
      )}
    </div>
  )
}
