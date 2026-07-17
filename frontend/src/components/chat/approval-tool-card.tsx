import {
  AlertTriangleIcon,
  CheckCircleIcon,
  Loader2Icon,
  ShieldCheckIcon,
  XCircleIcon,
} from "lucide-react"
import type { DynamicToolUIPart } from "ai"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { pb } from "@/lib/pocketbase"
import { cn } from "@/lib/utils"
import type { ToolApprovalData } from "@/types/chat"

type ApprovalResult = {
  ok?: boolean
  action?: string
  reason?: string
}

function parseResult(output: unknown): ApprovalResult | null {
  if (typeof output === "string") {
    try {
      return JSON.parse(output) as ApprovalResult
    } catch {
      return null
    }
  }
  return output && typeof output === "object"
    ? (output as ApprovalResult)
    : null
}

function formatDetailValue(
  detail: NonNullable<ToolApprovalData["details"]>[number]
) {
  if (detail.format !== "datetime") return detail.value
  const parsed = new Date(detail.value)
  if (Number.isNaN(parsed.getTime())) return detail.value
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function ApprovalToolCard({
  part,
  approval,
  runId,
  runActive,
  messageStatus,
}: {
  part: DynamicToolUIPart
  approval: ToolApprovalData
  runId?: string
  runActive: boolean
  messageStatus?: string
}) {
  const [submittingDecision, setSubmittingDecision] = useState<boolean | null>(
    null
  )
  const [requestError, setRequestError] = useState<string | null>(null)
  const result = parseResult(part.output)
  const presentation = approval.presentation ?? {}
  const destructive = presentation.confirmVariant === "destructive"
  const confirmVariant = destructive ? "destructive" : "default"
  const expired =
    messageStatus === "error" ||
    messageStatus === "cancelled" ||
    !runId ||
    !runActive
  const awaiting = part.state === "approval-requested"
  const responded = part.state === "approval-responded"
  const approved = responded ? part.approval.approved : undefined
  const denied =
    approved === false ||
    result?.action === "denied" ||
    result?.reason === "user_denied"
  const businessFailed =
    part.state === "output-available" && result?.ok === false && !denied
  const failed = part.state === "output-error" || businessFailed
  const completed =
    part.state === "output-available" && !denied && !businessFailed
  const submitting = submittingDecision !== null

  const respond = async (decision: boolean) => {
    if (!runId || submitting) return
    setSubmittingDecision(decision)
    setRequestError(null)
    try {
      await pb.send(
        `/api/chat/runs/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(approval.approvalId)}`,
        {
          method: "POST",
          body: { approved: decision },
          requestKey: null,
        }
      )
    } catch (error) {
      setSubmittingDecision(null)
      setRequestError(
        error instanceof Error
          ? error.message
          : "Could not submit the approval decision."
      )
    }
  }

  const StatusIcon = destructive ? AlertTriangleIcon : ShieldCheckIcon

  return (
    <div
      className={cn(
        "not-prose mb-4 w-full rounded-md border p-4",
        destructive ? "border-destructive/30 bg-destructive/5" : "bg-muted/20"
      )}
    >
      <div className="flex items-start gap-3">
        <StatusIcon
          className={cn(
            "mt-0.5 size-5 shrink-0",
            destructive ? "text-destructive" : "text-amber-600"
          )}
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">
                {approval.title || "Approve tool action?"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {approval.summary || "Review this action before it runs."}
              </div>
            </div>
            {awaiting && !expired && (
              <Badge variant="secondary">Awaiting approval</Badge>
            )}
            {awaiting && expired && (
              <Badge variant="outline">Approval expired</Badge>
            )}
            {responded && approved && (
              <Badge variant="secondary">Approved</Badge>
            )}
            {denied && <Badge variant="secondary">Rejected</Badge>}
            {completed && <Badge variant="secondary">Completed</Badge>}
            {failed && <Badge variant="destructive">Failed</Badge>}
          </div>

          {(approval.target?.name || approval.details?.length) && (
            <div className="space-y-1 rounded-md border bg-background/70 px-3 py-2 text-xs">
              {approval.target?.name && (
                <div className="font-medium">{approval.target.name}</div>
              )}
              {approval.details?.map((detail, index) => (
                <div
                  key={`${detail.label ?? "detail"}-${index}`}
                  className={cn(
                    "flex gap-2",
                    detail.tone === "destructive"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  {detail.label && (
                    <span className="shrink-0 font-medium">
                      {detail.label}:
                    </span>
                  )}
                  <span className="min-w-0 break-words">
                    {formatDetailValue(detail)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {awaiting && !expired && (
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={submitting}
                onClick={() => void respond(false)}
              >
                {submittingDecision === false && (
                  <Loader2Icon className="animate-spin" />
                )}
                Reject
              </Button>
              <Button
                type="button"
                variant={confirmVariant}
                size="sm"
                disabled={submitting}
                onClick={() => void respond(true)}
              >
                {submittingDecision === true && (
                  <Loader2Icon className="animate-spin" />
                )}
                {presentation.confirmLabel || "Approve"}
              </Button>
            </div>
          )}

          {responded && approved && !completed && !failed && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2Icon className="size-3.5 animate-spin" />
              {presentation.pendingMessage || "Applying approved action…"}
            </div>
          )}
          {denied && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <XCircleIcon className="size-3.5" />
              {presentation.deniedMessage || "Action cancelled."}
            </div>
          )}
          {completed && (
            <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
              <CheckCircleIcon className="size-3.5" />
              {presentation.successMessage || "Action completed."}
            </div>
          )}
          {failed && (
            <div className="text-xs text-destructive">
              {part.state === "output-error" && part.errorText
                ? part.errorText
                : presentation.failureMessage ||
                  "The approved action could not be completed."}
            </div>
          )}
          {requestError && (
            <div className="text-xs text-destructive">{requestError}</div>
          )}
        </div>
      </div>
    </div>
  )
}
