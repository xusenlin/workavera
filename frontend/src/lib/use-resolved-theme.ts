import { useEffect, useState } from "react"

import { useTheme } from "@/components/theme-provider"

export function useResolvedTheme(): "light" | "dark" {
  const { theme } = useTheme()
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const update = () => setSystemTheme(mediaQuery.matches ? "dark" : "light")
    mediaQuery.addEventListener("change", update)
    return () => mediaQuery.removeEventListener("change", update)
  }, [])

  return theme === "system" ? systemTheme : theme
}
