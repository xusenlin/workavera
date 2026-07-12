import { useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router"

import { ChatLayout } from "@/components/chat/chat-layout"
import {
  requestedRecordId,
  workspaceRecordUrl,
} from "@/lib/workspace-navigation"
import { useChatStore } from "@/store/chat"
import { useLlmSettingsStore } from "@/store/llm-settings"

export function ChatPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initializeChat = useChatStore((state) => state.initialize)
  const openConversation = useChatStore((state) => state.openConversation)
  const initializeModels = useLlmSettingsStore((state) => state.initialize)
  const requestedConversation = requestedRecordId(searchParams)

  useEffect(() => {
    let active = true
    void Promise.all([initializeChat(), initializeModels()]).then(async () => {
      if (!active) return
      if (requestedConversation) {
        const opened = await openConversation(requestedConversation)
        if (active && !opened) navigate("/chat", { replace: true })
        return
      }
      const activeConversationId = useChatStore.getState().activeConversationId
      if (activeConversationId) {
        navigate(workspaceRecordUrl("chat", activeConversationId), {
          replace: true,
        })
      }
    })
    return () => {
      active = false
    }
  }, [
    initializeChat,
    initializeModels,
    navigate,
    openConversation,
    requestedConversation,
  ])

  return <ChatLayout />
}
