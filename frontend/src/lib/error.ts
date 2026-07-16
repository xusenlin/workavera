import { ClientResponseError } from "pocketbase"

export function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ClientResponseError) {
    return error.response?.message || fallback
  }
  return error instanceof Error ? error.message : fallback
}

/**
 * True when the PocketBase SDK auto-cancelled the request because a newer
 * request with the same key superseded it. A superseded request is not a
 * failure: the newer flight delivers the result, so callers should ignore it
 * instead of surfacing an error.
 */
export function isRequestAbort(error: unknown): boolean {
  return error instanceof ClientResponseError && error.isAbort
}
