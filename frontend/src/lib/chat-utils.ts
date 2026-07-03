// Lightweight relative-time formatter for the chat UI.

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso).getTime()
  const now = Date.now()
  const diff = now - date

  const min = 60_000
  const hour = 60 * min
  const day = 24 * hour

  if (diff < min) return "just now"
  if (diff < hour) return `${Math.floor(diff / min)}m ago`
  if (diff < day) return `${Math.floor(diff / hour)}h ago`
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`

  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

export function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
