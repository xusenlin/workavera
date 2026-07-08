import type { IconSvgElement } from "@hugeicons/react"
import {
  Home02Icon,
  KanbanIcon,
  Chat01Icon,
  DocumentAttachmentIcon,
  ContactBookIcon,
  Calendar03Icon,
  BookOpen01Icon,
  AppWindowIcon,
  Settings02Icon,
} from "@hugeicons/core-free-icons"

export type NavItem = {
  title: string
  url: string
  icon: IconSvgElement
  description?: string
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        title: "Dashboard",
        url: "/dashboard",
        icon: Home02Icon,
        description: "Your personal overview at a glance",
      },
    ],
  },
  {
    label: "Workspace",
    items: [
      {
        title: "Chat",
        url: "/chat",
        icon: Chat01Icon,
        description: "Conversations with your Workavera assistant",
      },
      {
        title: "Board",
        url: "/board",
        icon: KanbanIcon,
        description: "Manage projects and tasks in a Kanban board",
      },
      {
        title: "Docs",
        url: "/docs",
        icon: DocumentAttachmentIcon,
        description: "Create notes, team documents, and public content",
      },
      {
        title: "Contacts",
        url: "/contacts",
        icon: ContactBookIcon,
        description: "Manage clients, partners, and collaborators",
      },
    ],
  },
  {
    label: "Personal",
    items: [
      {
        title: "Calendar",
        url: "/calendar",
        icon: Calendar03Icon,
        description: "Schedule and events",
      },
      {
        title: "Reading",
        url: "/reading",
        icon: BookOpen01Icon,
        description: "Bookmarks and reading list",
      },
      {
        title: "HTML Apps",
        url: "/html-apps",
        icon: AppWindowIcon,
        description: "AI-generated self-contained HTML apps",
      },
      {
        title: "Settings",
        url: "/settings",
        icon: Settings02Icon,
        description: "Manage your preferences and API keys",
      },
    ],
  },
]

export const flatNavItems: NavItem[] = navGroups.flatMap((g) => g.items)
