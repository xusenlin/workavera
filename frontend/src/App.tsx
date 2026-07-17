import { useEffect, useRef } from "react"

import { TooltipProvider } from "@/components/ui/tooltip"
import { Spinner } from "@/components/ui/spinner"
import { useTheme } from "@/components/theme-provider"
import { clearChatRuntimes } from "@/lib/chat-runtime"
import { AppRouter } from "@/router"
import { useAuthStore } from "@/store/auth"
import { useChatRunsStore } from "@/store/chat-runs"
import { useMemoriesStore } from "@/store/memories"
import { usePreferencesStore } from "@/store/preferences"

export function App() {
  const initialized = useAuthStore((state) => state.initialized)
  const initialize = useAuthStore((state) => state.initialize)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const initializePreferences = usePreferencesStore((state) => state.initialize)
  const clearPreferences = usePreferencesStore((state) => state.clear)
  const userTheme = usePreferencesStore((state) => state.preferences?.theme)
  const previousUserId = useRef(userId)
  const { setTheme } = useTheme()

  useEffect(() => {
    void initialize()
  }, [initialize])

  // Apply the signed-in user's saved theme once we know who they are.
  useEffect(() => {
    if (userTheme) setTheme(userTheme)
  }, [userTheme, setTheme])

  useEffect(() => {
    if (userId) {
      void initializePreferences()
    } else {
      clearPreferences()
    }
  }, [clearPreferences, initializePreferences, userId])

  useEffect(() => {
    if (previousUserId.current !== userId) {
      if (previousUserId.current !== null) {
        clearChatRuntimes()
        useChatRunsStore.getState().clear()
      }
      useMemoriesStore.getState().clear()
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
