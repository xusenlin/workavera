export type BatchItemResult<T> = {
  index: number
  ok: boolean
  result?: T
  error?: string
}

export type BatchToolResult<T> = {
  ok: boolean
  total: number
  succeeded: number
  failed: number
  results: BatchItemResult<T>[]
}

function parseOutput(output: unknown): unknown {
  if (typeof output !== "string") return output
  try {
    return JSON.parse(output)
  } catch {
    return null
  }
}

export function parseBatchToolResult<T>(
  output: unknown
): BatchToolResult<T> | null {
  const parsed = parseOutput(output)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null
  }
  const value = parsed as Record<string, unknown>
  if (
    typeof value.total !== "number" ||
    typeof value.succeeded !== "number" ||
    typeof value.failed !== "number" ||
    !Array.isArray(value.results)
  ) {
    return null
  }
  return parsed as BatchToolResult<T>
}
