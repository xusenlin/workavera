import { useEffect } from "react"

import { TooltipProvider } from "@/components/ui/tooltip"
import { Spinner } from "@/components/ui/spinner"
import { AppRouter } from "@/router"
import { useAuthStore } from "@/store/auth"

export function App() {
  const initialized = useAuthStore((state) => state.initialized)
  const initialize = useAuthStore((state) => state.initialize)

  useEffect(() => {
    void initialize()
  }, [initialize])

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
