import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Logout02Icon,
  Settings02Icon,
  UserCircle02Icon,
  BellIcon,
} from "@hugeicons/core-free-icons"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { NotificationItem } from "@/components/notifications/notification-item"
import { ThemeToggle } from "@/components/theme-toggle"
import { useTheme } from "@/components/theme-provider"
import { useAuthStore } from "@/store/auth"
import { useChatRunsStore } from "@/store/chat-runs"
import { useChatStore } from "@/store/chat"
import { workspaceRecordUrl } from "@/lib/workspace-navigation"
import { useNotificationsStore } from "@/store/notifications"
import { flatNavItems } from "@/lib/navigation"
import { pb } from "@/lib/pocketbase"

function getInitials(name: string) {
  return name.charAt(0).toUpperCase()
}

// Pages reachable outside the sidebar navigation still need a breadcrumb title.
const EXTRA_PAGE_TITLES: Record<string, string> = {
  "/notifications": "Notifications",
  "/profile": "Profile",
}

export function AppHeader() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { setTheme } = useTheme()
  const activeRunCount = useChatRunsStore(
    (state) => Object.keys(state.runs).length
  )
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recentNotifications = useNotificationsStore((state) => state.recent)
  const unreadCount = useNotificationsStore((state) => state.unreadCount)
  const initializeNotifications = useNotificationsStore(
    (state) => state.initialize
  )
  const disposeNotifications = useNotificationsStore((state) => state.dispose)
  const markRead = useNotificationsStore((state) => state.markRead)

  useEffect(() => {
    void initializeNotifications()
    return disposeNotifications
  }, [disposeNotifications, initializeNotifications])

  useEffect(() => {
    void pb
      .send<{ theme: "light" | "dark" | "system" }>("/api/configs/system", {
        method: "GET",
        requestKey: null,
      })
      .then((config) => setTheme(config.theme))
      .catch(() => {})
  }, [setTheme])

  const extraTitle = EXTRA_PAGE_TITLES[location.pathname]
  const currentNav =
    flatNavItems.find((item) => location.pathname === item.url) ??
    (extraTitle ? { title: extraTitle } : undefined)

  const handleLogout = () => {
    logout()
    navigate("/login", { replace: true })
  }

  const openActiveRun = () => {
    const [run] = Object.values(useChatRunsStore.getState().runs).sort(
      (left, right) => right.updated.localeCompare(left.updated)
    )
    if (!run) return
    useChatStore.getState().setActiveConversation(run.conversationId)
    navigate(workspaceRecordUrl("chat", run.conversationId))
  }

  const keepNotificationsOpen = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setNotificationsOpen(true)
  }

  const scheduleNotificationsClose = () => {
    closeTimer.current = setTimeout(() => setNotificationsOpen(false), 180)
  }

  const openNotification = (id: string) => {
    void markRead(id)
    setNotificationsOpen(false)
    navigate(workspaceRecordUrl("notifications", id))
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md">
      <SidebarTrigger className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mr-1 h-4 data-vertical:self-center"
      />

      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden sm:block">
            <BreadcrumbLink asChild>
              <a href="/dashboard">Home</a>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {currentNav && (
            <>
              <BreadcrumbSeparator className="hidden sm:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{currentNav.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      {activeRunCount > 0 && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="ml-auto gap-2"
          onClick={openActiveRun}
        >
          <Spinner className="size-3.5" />
          <span className="hidden sm:inline">AI is responding</span>
          <span>· {activeRunCount}</span>
        </Button>
      )}

      <div className="ml-auto flex items-center gap-1">
        <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
          <div
            onMouseEnter={keepNotificationsOpen}
            onMouseLeave={scheduleNotificationsClose}
          >
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="relative"
                aria-label="Notifications"
              >
                <HugeiconsIcon
                  icon={BellIcon}
                  strokeWidth={2}
                  className={
                    unreadCount > 0 ? "motion-safe:animate-pulse" : undefined
                  }
                />
                {unreadCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 flex size-2.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-70" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-96 gap-0 overflow-hidden p-0"
              onMouseEnter={keepNotificationsOpen}
              onMouseLeave={scheduleNotificationsClose}
            >
              <div className="flex items-center justify-between border-b px-3 py-2.5">
                <span className="text-sm font-semibold">Notifications</span>
                {unreadCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {unreadCount} unread
                  </span>
                )}
              </div>
              {recentNotifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No notifications yet.
                </p>
              ) : (
                recentNotifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    compact
                    onClick={() => openNotification(notification.id)}
                  />
                ))
              )}
              <button
                type="button"
                onClick={() => {
                  setNotificationsOpen(false)
                  navigate("/notifications")
                }}
                className="w-full cursor-pointer border-t px-3 py-2.5 text-center text-xs font-medium text-primary hover:bg-muted/50"
              >
                View all notifications
              </button>
            </PopoverContent>
          </div>
        </Popover>
        <ThemeToggle />
        <Separator
          orientation="vertical"
          className="mx-1 h-4 data-vertical:self-center"
        />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-1.5">
              <Avatar size="sm">
                {user?.avatar && (
                  <AvatarImage src={user.avatar} alt={user.name} />
                )}
                <AvatarFallback>
                  {user ? getInitials(user.name) : "?"}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium sm:inline">
                {user?.name ?? "Guest"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="flex items-center gap-2.5 py-2.5">
              <Avatar size="sm">
                {user?.avatar && (
                  <AvatarImage src={user.avatar} alt={user.name} />
                )}
                <AvatarFallback>
                  {user ? getInitials(user.name) : "?"}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1">
                <span className="truncate text-sm font-medium text-foreground">
                  {user?.name ?? "Guest"}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {user?.email ?? "Not signed in"}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => navigate("/profile")}>
                <HugeiconsIcon icon={UserCircle02Icon} strokeWidth={2} />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} />
                <span>Settings</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirmLogout(true)}
            >
              <HugeiconsIcon icon={Logout02Icon} strokeWidth={2} />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be signed out of your account and redirected to the login
              page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleLogout}>
              Log out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  )
}
