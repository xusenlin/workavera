import { HugeiconsIcon } from "@hugeicons/react"
import { Moon02Icon, Sun02Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useTheme } from "@/components/theme-provider"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          aria-label="Toggle theme"
        >
          <HugeiconsIcon
            icon={isDark ? Sun02Icon : Moon02Icon}
            strokeWidth={2}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Toggle theme (press <kbd>d</kbd>)
      </TooltipContent>
    </Tooltip>
  )
}
