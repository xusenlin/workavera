import { useEffect } from "react"
import { useNavigate } from "react-router"

import { ClientResponseError, type RecordModel } from "pocketbase"
import { toast } from "sonner"

import { pb } from "@/lib/pocketbase"
import { workspaceRecordUrl } from "@/lib/workspace-navigation"
import { useChatRunsStore, type ChatRunSummary } from "@/store/chat-runs"
import { useChatStore } from "@/store/chat"
import type { ChatMessageMetadata } from "@/types/chat"

type ChatMessageRecord = RecordModel & {
  conversation: string
  role: "user" | "assistant"
  status: "pending" | "streaming" | "complete" | "error" | "cancelled"
  metadata?: ChatMessageMetadata
  updated: string
}

function toRun(record: ChatMessageRecord): ChatRunSummary {
  return {
    messageId: record.id,
    conversationId: record.conversation,
    runId: record.metadata?.runId,
    updated: record.updated,
  }
}

export function ChatRunMonitor() {
  const navigate = useNavigate()

  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined

    const viewConversation = (conversationId: string) => {
      useChatStore.getState().setActiveConversation(conversationId)
      navigate(workspaceRecordUrl("chat", conversationId))
    }

    const notifyFinished = (record: ChatMessageRecord) => {
      const chat = useChatStore.getState()
      const isVisible =
        window.location.pathname.startsWith("/chat") &&
        chat.activeConversationId === record.conversation &&
        document.visibilityState === "visible"
      if (isVisible) return

      const title =
        chat.conversations.find((item) => item.id === record.conversation)
          ?.title ?? "Chat"
      const action = {
        label: "View",
        onClick: () => viewConversation(record.conversation),
      }
      if (record.status === "complete") {
        toast.success(`${title} has a new AI response.`, { action })
      } else if (record.status === "cancelled") {
        toast.info(`${title} generation was stopped.`, { action })
      } else {
        toast.error(
          record.metadata?.error?.message ?? `${title} generation failed.`,
          { action }
        )
      }
    }

    const start = async () => {
      try {
        unsubscribe = await pb
          .collection("chat_messages")
          .subscribe<ChatMessageRecord>(
            "*",
            (event) => {
              if (event.record.role !== "assistant") return
              const runs = useChatRunsStore.getState()
              if (event.action === "delete") {
                runs.remove(event.record.id)
                return
              }
              if (event.record.status === "streaming") {
                runs.upsert(toRun(event.record))
                return
              }

              const wasRunning = !!runs.runs[event.record.id]
              runs.remove(event.record.id)
              if (!wasRunning) return

              const chat = useChatStore.getState()
              if (chat.initialized) void chat.refresh()
              notifyFinished(event.record)
            },
            { requestKey: null }
          )
        if (disposed) {
          unsubscribe()
          return
        }

        const records = await pb
          .collection("chat_messages")
          .getFullList<ChatMessageRecord>({
            filter: "role = 'assistant' && status = 'streaming'",
            sort: "-updated",
            requestKey: null,
          })
        if (!disposed) {
          useChatRunsStore.getState().replace(records.map(toRun))
        }
      } catch (error) {
        if (error instanceof ClientResponseError && error.isAbort) return
        if (!disposed) useChatRunsStore.getState().clear()
      }
    }

    void start()
    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [navigate])

  return null
}
