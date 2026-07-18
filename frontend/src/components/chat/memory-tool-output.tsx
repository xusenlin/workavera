import { useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Brain02Icon,
  Delete02Icon,
  Settings02Icon,
  Undo03Icon,
} from "@hugeicons/core-free-icons"
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  XCircleIcon,
} from "lucide-react"
import type { DynamicToolUIPart } from "ai"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { pb } from "@/lib/pocketbase"
import { useMemoriesStore, type MemoryCategory } from "@/store/memories"

type ToolMemory = {
  id: string
  category: MemoryCategory
  content: string
  active: boolean
  origin: "manual" | "explicit" | "automatic"
  updated: string
}

type MemoryToolResult = {
  action: "created" | "updated" | "unchanged" | "forgotten" | "undone"
  original_action?: "created" | "updated"
  memory: ToolMemory
}

function parseResult(output: unknown): MemoryToolResult | null {
  if (output && typeof output === "object" && !Array.isArray(output)) {
    return output as MemoryToolResult
  }
  if (typeof output === "string") {
    try {
      return JSON.parse(output) as MemoryToolResult
    } catch {
      return null
    }
  }
  return null
}

function inputOrigin(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const origin = (input as Record<string, unknown>).origin
  return origin === "automatic" || origin === "explicit" ? origin : null
}

export function MemoryToolCard({
  part,
  messageId,
  runActive,
}: {
  part: DynamicToolUIPart
  messageId: string
  runActive: boolean
}) {
  const navigate = useNavigate()
  const refreshMemories = useMemoriesStore((state) => state.initialize)
  const [updatedResult, setUpdatedResult] = useState<MemoryToolResult | null>(
    null
  )
  const [undoing, setUndoing] = useState(false)
  const result = updatedResult ?? parseResult(part.output)
  const loading =
    part.state === "input-streaming" || part.state === "input-available"
  const failed = part.state === "output-error"
  const forget = part.toolName === "system_memory_forget"
  const origin = inputOrigin(part.input)

  const title = loading
    ? forget
      ? "Forgetting memory..."
      : "Saving memory..."
    : failed
      ? "Memory action failed"
      : result?.action === "undone"
        ? "Memory change undone"
        : forget
          ? "Memory forgotten"
          : origin === "automatic"
            ? "Chat automatically remembered this"
            : result?.action === "unchanged"
              ? "Already remembered"
              : "Remembered as requested"

  const undo = async () => {
    if (!result || !["created", "updated"].includes(result.action)) return
    setUndoing(true)
    try {
      const undone = await pb.send<MemoryToolResult>(
        `/api/chat/messages/${encodeURIComponent(messageId)}/memory-actions/${encodeURIComponent(part.toolCallId)}/undo`,
        { method: "POST", requestKey: null }
      )
      setUpdatedResult(undone)
      await refreshMemories(true)
      toast.success("Memory change undone")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not undo memory change"
      )
    } finally {
      setUndoing(false)
    }
  }

  return (
    <Collapsible
      defaultOpen={false}
      className="group not-prose mb-4 w-full rounded-xl border bg-muted/10"
    >
      <CollapsibleTrigger className="flex w-full items-start gap-3 p-3 text-left">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <HugeiconsIcon
            icon={forget ? Delete02Icon : Brain02Icon}
            strokeWidth={2}
            className="size-4"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          {loading && <ClockIcon className="size-3.5 animate-pulse" />}
          {failed && <XCircleIcon className="size-3.5 text-destructive" />}
          {!loading && !failed && (
            <CheckCircleIcon className="size-3.5 text-green-600" />
          )}
          {result?.memory.category && (
            <Badge variant="secondary" className="capitalize">
              {result.memory.category}
            </Badge>
          )}
        </div>
        <ChevronDownIcon className="mt-2 size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-3 px-3 pb-3 pl-14 outline-none">
        {result?.memory.content && !failed && (
          <p className="text-sm text-muted-foreground">
            {result.memory.content}
          </p>
        )}
        {failed && part.state === "output-error" && (
          <p className="text-xs text-destructive">{part.errorText}</p>
        )}
        {!loading && !failed && (
          <div className="flex items-center justify-end gap-1">
            {!forget &&
              !runActive &&
              result &&
              ["created", "updated"].includes(result.action) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void undo()}
                  disabled={undoing}
                >
                  <HugeiconsIcon icon={Undo03Icon} strokeWidth={2} />
                  {undoing ? "Undoing..." : "Undo"}
                </Button>
              )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/settings?manage=memory")}
            >
              <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} />
              Manage
            </Button>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
