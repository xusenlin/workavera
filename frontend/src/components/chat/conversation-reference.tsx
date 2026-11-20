import { useEffect, useRef, useState, type ReactNode } from "react"
import { Link, useNavigate } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { Chat01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"
import { ChevronRight, Loader2 } from "lucide-react"
import { ClientResponseError } from "pocketbase"
import { getChatRuntime } from "@/lib/chat-runtime"
import { cn } from "@/lib/utils"

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { pb } from "@/lib/pocketbase"
import { formatRelativeTime } from "@/lib/chat-utils"
import { workspaceRecordUrl } from "@/lib/workspace-navigation"
import type {
  ChatUIMessage,
  Conversation,
  ConversationReference,
} from "@/types/chat"

export type ConversationOption = Pick<
  Conversation,
  "id" | "title" | "status" | "last_message_at"
>

type SourceTranscript = {
  source: ConversationOption
  messages: ChatUIMessage[]
  messageId?: string
}

function useOpenSource() {
  const navigate = useNavigate()
  const [preview, setPreview] = useState<SourceTranscript | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  const open = async (id: string, messageId?: string) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    const options = { requestKey: null, signal: controller.signal }
    setError("")
    setLoading(true)
    try {
      const [source, messages] = await Promise.all([
        pb
          .collection("chat_conversations")
          .getOne<ConversationOption>(id, {
            ...options,
            fields: "id,title,status",
          }),
        pb.send<ChatUIMessage[]>(
          `/api/chat/conversations/${encodeURIComponent(id)}/messages`,
          options
        ),
      ])
      if (controller.signal.aborted) return
      if (
        messageId &&
        !messages.some(
          (m) =>
            m.id === messageId &&
            m.metadata?.status === "complete" &&
            m.parts.some((p) => p.type === "text" && p.text.trim())
        )
      ) {
        setError("Source message unavailable.")
        return
      }
      if (messageId && source.status === "active") {
        const runtime = getChatRuntime(id)
        // An idle cached chat can still have optimistic client IDs. Use the
        // verified transcript to restore server IDs before opening the anchor.
        if (
          !runtime.state.activeRunId &&
          runtime.chat.status !== "streaming" &&
          runtime.chat.status !== "submitted"
        ) {
          if (
            runtime.state.hydrated &&
            !messages.some((m) => m.metadata?.status === "streaming")
          )
            runtime.chat.messages = messages
        }
        if (
          !runtime.state.hydrated ||
          runtime.chat.messages.some((m) => m.id === messageId)
        ) {
          navigate(
            workspaceRecordUrl("chat", id) +
              "&message=" +
              encodeURIComponent(messageId)
          )
          return
        }
      }
      // Archived sources and anchors absent from a live stream can be read
      // at the precise position without replacing that stream's messages.
      setPreview({ source, messages, messageId })
    } catch (err) {
      if (!controller.signal.aborted)
        setError(
          err instanceof ClientResponseError && err.status === 404
            ? "Conversation unavailable."
            : "Could not open the conversation. Try again."
        )
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }
  return { open, loading, error, preview, close: () => setPreview(null) }
}

function SourceViewer({
  result,
  close,
}: {
  result: SourceTranscript
  close: () => void
}) {
  const target = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = target.current
    if (!el) return
    el.scrollIntoView({ block: "center" })
    const highlight = el.animate(
      [
        { backgroundColor: "var(--accent)" },
        { backgroundColor: "transparent" },
      ],
      { duration: 2200, easing: "ease-out" }
    )
    return () => highlight.cancel()
  }, [result])
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent
        className="flex max-h-[80dvh] flex-col sm:max-w-2xl"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{result.source.title}</DialogTitle>
        </DialogHeader>
        {result.source.status === "archived" && (
          <span className="text-xs text-muted-foreground">
            Archived · Read only
          </span>
        )}
        <div className="min-h-0 space-y-3 overflow-y-auto">
          {result.messages.length === 0 && <p>No messages yet.</p>}
          {result.messages.map((msg) => {
            const body = msg.parts
              .flatMap((p) => {
                if (p.type === "text") return [p.text]
                if (p.type === "data-resource")
                  return [p.data.name ?? "Attached file"]
                if (p.type === "data-conversation") return [p.data.title]
                return []
              })
              .join("\n")
            return (
              <div
                key={msg.id}
                ref={msg.id === result.messageId ? target : undefined}
                className="rounded-md p-2"
              >
                <div className="text-xs text-muted-foreground">
                  {msg.role === "user" ? "You" : "Assistant"}{" "}
                  {msg.metadata?.createdAt &&
                    formatRelativeTime(msg.metadata.createdAt)}
                </div>
                <div className="text-sm break-words whitespace-pre-wrap">
                  {body || "No visible message text."}
                </div>
              </div>
            )
          })}
        </div>
        {result.source.status === "active" && (
          <Button asChild variant="outline" size="sm">
            <Link
              onClick={close}
              to={workspaceRecordUrl("chat", result.source.id)}
            >
              Open chat
            </Link>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function ConversationChip({
  source,
  onRemove,
}: {
  source: ConversationReference
  onRemove?: () => void
}) {
  const viewer = useOpenSource()
  return (
    <>
      <Attachment
        size={onRemove ? "xs" : "sm"}
        className="max-w-64"
        title={source.title}
      >
        <AttachmentMedia>
          <HugeiconsIcon icon={Chat01Icon} />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>{source.title}</AttachmentTitle>
          <AttachmentDescription>
            {viewer.error || "Conversation"}
          </AttachmentDescription>
        </AttachmentContent>
        {onRemove ? (
          <AttachmentActions>
            <AttachmentAction
              type="button"
              aria-label={`Remove ${source.title}`}
              onClick={onRemove}
            >
              <HugeiconsIcon icon={Cancel01Icon} />
            </AttachmentAction>
          </AttachmentActions>
        ) : (
          <AttachmentTrigger
            aria-label={`View ${source.title}`}
            disabled={viewer.loading}
            onClick={() => void viewer.open(source.conversationId)}
          />
        )}
      </Attachment>
      {viewer.preview && (
        <SourceViewer result={viewer.preview} close={viewer.close} />
      )}
    </>
  )
}

export type SentConversation = ConversationReference & {
  messageId: string
  excerpt: string
  matchedKeywords?: string[]
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function highlightExcerpt(excerpt: string, keywords?: string[]): ReactNode {
  if (!keywords || keywords.length === 0) return excerpt
  const terms = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length
  )
  if (terms.length === 0) return excerpt
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi")
  const parts = excerpt.split(pattern)
  if (parts.length === 1) return excerpt
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <strong key={index} className="font-semibold text-foreground">
        {part}
      </strong>
    ) : (
      part
    )
  )
}

export function SentConversationCard({ source }: { source: SentConversation }) {
  const viewer = useOpenSource()
  const unavailable = Boolean(viewer.error)
  return (
    <>
      <button
        type="button"
        disabled={viewer.loading}
        aria-busy={viewer.loading}
        aria-label={`Open source message in ${source.title}`}
        onClick={() =>
          void viewer.open(source.conversationId, source.messageId)
        }
        className={cn(
          "not-prose group/source my-2 flex w-full items-center gap-3.5 rounded-xl border bg-card/95 px-3.5 py-3 text-left text-card-foreground shadow-xs transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.995] disabled:cursor-wait motion-reduce:transition-none motion-reduce:active:scale-100",
          unavailable
            ? "border-destructive/35 bg-destructive/[0.03] hover:border-destructive/50"
            : "border-border/80 hover:border-foreground/20 hover:bg-accent/40 hover:shadow-sm"
        )}
      >
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset transition-colors duration-150",
            unavailable
              ? "bg-muted/60 text-muted-foreground/70 ring-border/60"
              : "bg-sky-500/12 text-sky-600 ring-sky-500/20 group-hover/source:bg-sky-500/18 dark:bg-sky-400/15 dark:text-sky-400 dark:ring-sky-400/25 dark:group-hover/source:bg-sky-400/22"
          )}
        >
          <HugeiconsIcon icon={Chat01Icon} strokeWidth={1.8} className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block truncate text-sm leading-5 font-semibold tracking-[-0.01em]"
            title={source.title}
          >
            {source.title}
          </span>
          <span className="mt-0.5 line-clamp-2 text-xs leading-[1.5] break-words text-muted-foreground">
            {highlightExcerpt(source.excerpt, source.matchedKeywords)}
          </span>
          {viewer.error && (
            <span
              role="status"
              className="mt-1 block text-[11px] font-medium text-destructive"
            >
              {viewer.error}
            </span>
          )}
        </span>
        {viewer.loading ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground/70 transition-all duration-150 group-hover/source:translate-x-0.5 group-hover/source:text-foreground motion-reduce:transition-none" />
        )}
      </button>
      {viewer.preview && (
        <SourceViewer result={viewer.preview} close={viewer.close} />
      )}
    </>
  )
}
