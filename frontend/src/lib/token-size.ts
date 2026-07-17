/** Parses "128k", "1.5m", or a plain number of tokens; NaN when invalid. */
export function parseTokenSize(raw: string): number {
  const text = raw.trim().toLowerCase()
  if (!text) return NaN
  const match = /^(\d+(?:\.\d+)?)([km]?)$/.exec(text)
  if (!match) return NaN
  const base = Number(match[1])
  const factor = match[2] === "m" ? 1000000 : match[2] === "k" ? 1000 : 1
  const value = Math.round(base * factor)
  return Number.isInteger(value) && value > 0 ? value : NaN
}

/** Formats a token count with a compact k or M suffix. */
export function formatTokenSize(tokens: number) {
  if (tokens >= 1000000) {
    return `${Number((tokens / 1000000).toFixed(1))}M`
  }
  if (tokens >= 1000) {
    return `${Number((tokens / 1000).toFixed(1))}k`
  }
  return String(tokens)
}
