import { HugeiconsIcon } from "@hugeicons/react"
import { ChevronDownIcon, ContactBookIcon } from "@hugeicons/core-free-icons"
import {
  CheckCircleIcon,
  CircleIcon,
  ClockIcon,
  XCircleIcon,
} from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { pb } from "@/lib/pocketbase"
import { ToolInput } from "@/components/chat/tool-input"
import { cn } from "@/lib/utils"
import { workspaceRecordUrl } from "@/lib/workspace-navigation"
import type { DynamicToolUIPart } from "ai"
import type { ReactNode } from "react"
import { useNavigate } from "react-router"

type UserStatus = "online" | "away" | "busy" | "offline"

type ContactSummary = {
  id: string
  name: string
  title?: string
  status?: UserStatus
  /** PocketBase avatar file name. */
  avatar?: string
  /** PocketBase collection id, needed to resolve the avatar file URL. */
  collectionId?: string
}

const MAX_VISIBLE = 16

const USER_STATUS_META: {
  value: UserStatus
  label: string
  color: string
}[] = [
  { value: "online", label: "Online", color: "#22c55e" },
  { value: "away", label: "Away", color: "#f59e0b" },
  { value: "busy", label: "Busy", color: "#ef4444" },
  { value: "offline", label: "Offline", color: "#64748b" },
]

function statusMeta(status?: UserStatus) {
  return USER_STATUS_META.find((s) => s.value === status)
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

function getInitials(name: string) {
  return name.charAt(0).toUpperCase()
}

function avatarUrl(contact: ContactSummary): string | undefined {
  if (!contact.avatar || !contact.collectionId) return undefined
  return pb.files.getURL(
    { id: contact.id, collectionId: contact.collectionId },
    contact.avatar
  )
}

/** Parses the tool output, tolerating either a parsed array or a JSON string. */
function parseContacts(output: unknown): ContactSummary[] {
  if (Array.isArray(output)) return output as ContactSummary[]
  if (typeof output === "string") {
    try {
      const parsed = JSON.parse(output)
      return Array.isArray(parsed) ? (parsed as ContactSummary[]) : []
    } catch {
      return []
    }
  }
  return []
}

type ContactsToolPart = DynamicToolUIPart

export function ContactsToolCard({ part }: { part: ContactsToolPart }) {
  const contacts = parseContacts(part.output)
  const visible = contacts.slice(0, MAX_VISIBLE)
  const overflow = contacts.length - visible.length
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
            icon={ContactBookIcon}
            strokeWidth={2}
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="text-sm font-medium">Contacts</span>
          {contacts.length > 0 && (
            <Badge variant="secondary" className="rounded-full px-1.5">
              {contacts.length}
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
              <span>Loading contacts...</span>
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
        {part.state === "output-available" && contacts.length > 0 && (
          <TooltipProvider delayDuration={200}>
            <div className="flex flex-wrap gap-2">
              {visible.map((contact) => {
                const meta = statusMeta(contact.status)
                const src = avatarUrl(contact)
                return (
                  <Tooltip key={contact.id}>
                    <TooltipTrigger asChild>
                      <div
                        className="flex cursor-pointer items-center gap-2 rounded-full border bg-card px-2 py-1 transition-colors hover:bg-muted/50"
                        onClick={() =>
                          navigate(workspaceRecordUrl("contacts", contact.id))
                        }
                      >
                        <Avatar size="sm">
                          {src && <AvatarImage src={src} alt={contact.name} />}
                          <AvatarFallback>
                            {getInitials(contact.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="pr-1 text-sm font-medium">
                          {contact.name}
                        </span>
                        {meta && (
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: meta.color }}
                          />
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="flex flex-col items-start gap-0.5 py-1.5">
                      <div className="flex items-center gap-1.5">
                        {meta && (
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: meta.color }}
                          />
                        )}
                        <span className="font-medium">{contact.name}</span>
                      </div>
                      {contact.title && (
                        <span className="text-background/70">
                          {contact.title}
                        </span>
                      )}
                      {meta && (
                        <span className="text-background/70">{meta.label}</span>
                      )}
                    </TooltipContent>
                  </Tooltip>
                )
              })}
              {overflow > 0 && (
                <div className="flex items-center rounded-full border bg-muted px-2.5 py-1 text-sm text-muted-foreground">
                  +{overflow}
                </div>
              )}
            </div>
          </TooltipProvider>
        )}

        {/* Empty result */}
        {part.state === "output-available" && contacts.length === 0 && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            No contacts found
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
