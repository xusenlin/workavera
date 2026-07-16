export const OPEN_RECORD_PARAM = "open"

export type OpenableWorkspaceModule =
  | "board"
  | "calendar"
  | "chat"
  | "contacts"
  | "docs"
  | "reading"
  | "notifications"

export function workspaceRecordUrl(
  module: OpenableWorkspaceModule,
  recordId: string
) {
  const params = new URLSearchParams({
    [OPEN_RECORD_PARAM]: recordId.trim(),
  })
  return `/${module}?${params.toString()}`
}

export function requestedRecordId(searchParams: URLSearchParams) {
  return searchParams.get(OPEN_RECORD_PARAM)?.trim() ?? ""
}
