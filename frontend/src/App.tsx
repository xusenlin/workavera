import { useEffect, useRef } from "react"

import { TooltipProvider } from "@/components/ui/tooltip"
import { Spinner } from "@/components/ui/spinner"
import { clearChatRuntimes } from "@/lib/chat-runtime"
import { AppRouter } from "@/router"
import { useAuthStore } from "@/store/auth"
import { useChatRunsStore } from "@/store/chat-runs"

export function App() {
  const initialized = useAuthStore((state) => state.initialized)
  const initialize = useAuthStore((state) => state.initialize)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const previousUserId = useRef(userId)

  useEffect(() => {
    void initialize()
  }, [initialize])

  useEffect(() => {
    if (previousUserId.current !== userId) {
      if (previousUserId.current !== null) {
        clearChatRuntimes()
        useChatRunsStore.getState().clear()
      }
      previousUserId.current = userId
    }
  }, [userId])

  if (!initialized) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  return (
    <TooltipProvider>
      <AppRouter />
    </TooltipProvider>
  )
}

export default App
