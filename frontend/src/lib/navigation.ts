import type { IconSvgElement } from "@hugeicons/react"
import {
  Home02Icon,
  KanbanIcon,
  Notebook01Icon,
  Chat01Icon,
  BloggerIcon,
  Calendar03Icon,
  BookOpen01Icon,
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
        title: "Board",
        url: "/board",
        icon: KanbanIcon,
        description: "Manage projects and tasks in a Kanban board",
      },
      {
        title: "Notes",
        url: "/notes",
        icon: Notebook01Icon,
        description: "Capture ideas and thoughts",
      },
      {
        title: "Chat",
        url: "/chat",
        icon: Chat01Icon,
        description: "Conversations with your Workavera assistant",
      },
      {
        title: "Blog",
        url: "/blog",
        icon: BloggerIcon,
        description: "Write and publish posts",
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
        title: "Settings",
        url: "/settings",
        icon: Settings02Icon,
        description: "Manage your preferences and API keys",
      },
    ],
  },
]

export const flatNavItems: NavItem[] = navGroups.flatMap((g) => g.items)
