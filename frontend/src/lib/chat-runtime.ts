import { useSyncExternalStore } from "react"

import { Chat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"

import { pb } from "@/lib/pocketbase"
import { useChatStore } from "@/store/chat"
import type { ChatUIMessage } from "@/types/chat"

type RuntimeState = {
  hydrated: boolean
  loading: boolean
  recovering: boolean
  activeRunId: string | null
  recoveryError: string | null
}

export type ChatRuntime = {
  chat: Chat<ChatUIMessage>
  state: RuntimeState
  subscribe: (listener: () => void) => () => void
  hydrate: () => Promise<void>
  retry: () => Promise<void>
  setActiveRunId: (runId: string | null) => void
}

const runtimes = new Map<string, ChatRuntime>()

const transport = new DefaultChatTransport<ChatUIMessage>({
  api: `${pb.baseURL}/api/chat/stream`,
  headers: () => ({ Authorization: pb.authStore.token }),
  prepareSendMessagesRequest: ({ messages, body, headers }) => ({
    headers,
    body: {
      ...body,
      message: messages.at(-1),
    },
  }),
  prepareReconnectToStreamRequest: ({ body, headers }) => {
    const runId = typeof body?.runId === "string" ? body.runId : ""
    return {
      api: `${pb.baseURL}/api/chat/runs/${encodeURIComponent(runId)}/stream`,
      headers,
    }
  },
})

async function loadMessages(conversationId: string) {
  return pb.send<ChatUIMessage[]>(
    `/api/chat/conversations/${conversationId}/messages`,
    { method: "GET", requestKey: null }
  )
}

function lastStreamingRun(messages: ChatUIMessage[]) {
  const last = messages.at(-1)
  if (
    last?.role !== "assistant" ||
    last.metadata?.status !== "streaming" ||
    !last.metadata.runId
  ) {
    return null
  }
  return { message: last, runId: last.metadata.runId }
}

function createRuntime(conversationId: string): ChatRuntime {
  const listeners = new Set<() => void>()
  let hydrationPromise: Promise<void> | null = null
  let recoveryPromise: Promise<void> | null = null

  const runtime = {
    state: {
      hydrated: false,
      loading: false,
      recovering: false,
      activeRunId: null,
      recoveryError: null,
    },
  } as ChatRuntime

  const update = (patch: Partial<RuntimeState>) => {
    runtime.state = { ...runtime.state, ...patch }
    listeners.forEach((listener) => listener())
  }

  const reconcile = async (loaded: ChatUIMessage[]) => {
    const streaming = lastStreamingRun(loaded)
    if (!streaming) {
      runtime.chat.messages = loaded
      update({
        hydrated: true,
        loading: false,
        recovering: false,
        activeRunId: null,
        recoveryError: null,
      })
      return
    }

    runtime.chat.messages = loaded.slice(0, -1)
    update({
      hydrated: true,
      loading: false,
      recovering: true,
      activeRunId: streaming.runId,
      recoveryError: null,
    })

    recoveryPromise = runtime.chat
      .resumeStream({ body: { runId: streaming.runId } })
      .then(async () => {
        const latest = await loadMessages(conversationId)
        const stillStreaming = lastStreamingRun(latest)
        runtime.chat.messages = latest
        update({
          recovering: false,
          activeRunId: stillStreaming?.runId ?? null,
          recoveryError: stillStreaming
            ? "The response is still running, but the stream could not be reconnected."
            : null,
        })
      })
      .catch(async (error: unknown) => {
        const latest = await loadMessages(conversationId).catch(() => loaded)
        runtime.chat.messages = latest
        const stillStreaming = lastStreamingRun(latest)
        update({
          recovering: false,
          activeRunId: stillStreaming?.runId ?? null,
          recoveryError:
            error instanceof Error
              ? error.message
              : "Could not reconnect to the response stream.",
        })
      })
      .finally(() => {
        recoveryPromise = null
      })
  }

  runtime.chat = new Chat<ChatUIMessage>({
    id: conversationId,
    transport,
    onError: (error) => {
      update({ recoveryError: error.message })
    },
    onFinish: () => {
      update({ recovering: false, activeRunId: null, recoveryError: null })
      void useChatStore.getState().refresh()
    },
  })

  runtime.subscribe = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  runtime.hydrate = async () => {
    if (runtime.state.hydrated || hydrationPromise) {
      return hydrationPromise ?? Promise.resolve()
    }
    update({ loading: true, recoveryError: null })
    hydrationPromise = loadMessages(conversationId)
      .then(reconcile)
      .catch((error: unknown) => {
        update({
          loading: false,
          recoveryError:
            error instanceof Error ? error.message : "Could not load messages.",
        })
      })
      .finally(() => {
        hydrationPromise = null
      })
    return hydrationPromise
  }

  runtime.retry = async () => {
    if (recoveryPromise) return recoveryPromise
    runtime.chat.clearError()
    update({ loading: true, recoveryError: null })
    const loaded = await loadMessages(conversationId)
    await reconcile(loaded)
  }

  runtime.setActiveRunId = (runId) => {
    update({ activeRunId: runId, recoveryError: null })
  }

  return runtime
}

export function getChatRuntime(conversationId: string) {
  let runtime = runtimes.get(conversationId)
  if (!runtime) {
    runtime = createRuntime(conversationId)
    runtimes.set(conversationId, runtime)
  }
  return runtime
}

export function useChatRuntime(conversationId: string) {
  const runtime = getChatRuntime(conversationId)
  const state = useSyncExternalStore(
    runtime.subscribe,
    () => runtime.state,
    () => runtime.state
  )
  return { runtime, state }
}

export function clearChatRuntimes() {
  for (const runtime of runtimes.values()) {
    void runtime.chat.stop()
  }
  runtimes.clear()
}
