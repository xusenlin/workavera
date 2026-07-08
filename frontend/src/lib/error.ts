import { ClientResponseError } from "pocketbase"

export function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ClientResponseError) {
    return error.response?.message || fallback
  }
  return error instanceof Error ? error.message : fallback
}
