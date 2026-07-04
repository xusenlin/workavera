import { NavLink } from "react-router"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Task01Icon,
  ContactBookIcon,
  Chat01Icon,
  DocumentAttachmentIcon,
  CheckmarkCircle04Icon,
  ArrowUpRight01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuthStore } from "@/store/auth"
import { flatNavItems } from "@/lib/navigation"

type Stat = {
  label: string
  value: string
  change: string
  icon: typeof Task01Icon
  url: string
}

const stats: Stat[] = [
  {
    label: "Open Tasks",
    value: "12",
    change: "+3 this week",
    icon: Task01Icon,
    url: "/board",
  },
  {
    label: "Contacts",
    value: "48",
    change: "+6 this week",
    icon: ContactBookIcon,
    url: "/contacts",
  },
  {
    label: "Chats",
    value: "5",
    change: "2 active",
    icon: Chat01Icon,
    url: "/chat",
  },
  {
    label: "Documents",
    value: "9",
    change: "+1 this week",
    icon: DocumentAttachmentIcon,
    url: "/docs",
  },
]

const recentActivity = [
  { action: "Completed task", target: "Review Q3 roadmap", time: "2h ago" },
  { action: "Added contact", target: "Alice Chen — Acme", time: "5h ago" },
  {
    action: "Updated document",
    target: "Getting started with Workavera",
    time: "1d ago",
  },
  { action: "Started chat", target: "Trip planning", time: "2d ago" },
]

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)

  const quickLinks = flatNavItems.filter((i) => i.url !== "/dashboard")

  return (
    <div className="flex flex-col gap-6">
      {/* Greeting */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Hello, {user?.name?.split(" ")[0] ?? "there"} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening in your workspace today.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <NavLink key={stat.label} to={stat.url} className="group">
            <Card className="transition-all group-hover:ring-foreground/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardDescription>{stat.label}</CardDescription>
                  <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <HugeiconsIcon
                      icon={stat.icon}
                      strokeWidth={2}
                      className="size-4"
                    />
                  </div>
                </div>
                <CardTitle className="text-3xl font-semibold tracking-tight tabular-nums">
                  {stat.value}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <HugeiconsIcon
                    icon={ArrowUpRight01Icon}
                    strokeWidth={2}
                    className="size-3.5 text-emerald-500"
                  />
                  {stat.change}
                </p>
              </CardContent>
            </Card>
          </NavLink>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent activity */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>
              Your latest actions across the app
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1">
              {recentActivity.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/50"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <HugeiconsIcon
                      icon={CheckmarkCircle04Icon}
                      strokeWidth={2}
                      className="size-4"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      <span className="text-muted-foreground">
                        {item.action}:{" "}
                      </span>
                      <span className="font-medium">{item.target}</span>
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {item.time}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Quick access */}
        <Card>
          <CardHeader>
            <CardTitle>Quick access</CardTitle>
            <CardDescription>Jump to a workspace</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1">
              {quickLinks.map((item) => (
                <li key={item.title}>
                  <NavLink
                    to={item.url}
                    className="group/quick flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover/quick:text-foreground">
                      <HugeiconsIcon
                        icon={item.icon}
                        strokeWidth={2}
                        className="size-4"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                    <HugeiconsIcon
                      icon={ArrowUpRight01Icon}
                      strokeWidth={2}
                      className="size-4 text-muted-foreground transition-colors group-hover/quick:text-foreground"
                    />
                  </NavLink>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Tip */}
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <HugeiconsIcon
              icon={SparklesIcon}
              strokeWidth={2}
              className="size-4"
            />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">
              Tip: Press ⌘B to toggle the sidebar
            </p>
            <p className="text-xs text-muted-foreground">
              You can also press <kbd className="text-foreground">d</kbd> to
              switch between light and dark themes.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
