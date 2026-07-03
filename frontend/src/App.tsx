import { TooltipProvider } from "@/components/ui/tooltip"
import { AppRouter } from "@/router"

export function App() {
  return (
    <TooltipProvider>
      <AppRouter />
    </TooltipProvider>
  )
}

export default App
