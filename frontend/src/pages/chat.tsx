import { useEffect } from "react"

import { ChatLayout } from "@/components/chat/chat-layout"
import { useChatStore } from "@/store/chat"
import { useLlmSettingsStore } from "@/store/llm-settings"

export function ChatPage() {
  const initializeChat = useChatStore((state) => state.initialize)
  const initializeModels = useLlmSettingsStore((state) => state.initialize)

  useEffect(() => {
    void initializeChat()
    void initializeModels()
  }, [initializeChat, initializeModels])

  return <ChatLayout />
}
