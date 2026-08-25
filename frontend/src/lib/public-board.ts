import type { Priority, StateCategory } from "@/store/board"

export type PublicProject = {
  name: string
  description?: string
  start?: string
  end?: string
  taskCount: number
  completedCount: number
}

export type PublicState = {
  id: string
  name: string
  color: string
  category: StateCategory
  sortOrder: number
  taskCount: number
}

export type PublicMember = {
  name: string
  /** 1-based position addressing the avatar proxy; absent without an avatar. */
  avatar?: number
  owner?: boolean
}

export type PublicLabel = {
  name: string
  color: string
}

/** A slug is present only while the document's own public link resolves. */
export type PublicDocumentLink = {
  title: string
  slug?: string
}

export type PublicTask = {
  id: string
  title: string
  description?: string
  stateId: string
  priority: Priority
  startDate?: string
  dueDate?: string
  labels: PublicLabel[]
  documents: PublicDocumentLink[]
}

export type PublicPreview = {
  project: PublicProject
  states: PublicState[]
  members: PublicMember[]
  tasks: PublicTask[]
}

export function publicAvatarURL(slug: string, index: number) {
  return `/api/public/board/${encodeURIComponent(slug)}/avatars/${index}`
}
