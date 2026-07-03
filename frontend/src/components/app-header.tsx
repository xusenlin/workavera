import { useLocation, useNavigate } from "react-router"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Logout02Icon,
  Search02Icon,
  Settings02Icon,
  UserCircle02Icon,
  BellIcon,
} from "@hugeicons/core-free-icons"

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
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { useAuthStore } from "@/store/auth"
import { flatNavItems } from "@/lib/navigation"

function getInitials(name: string) {
  return name.charAt(0).toUpperCase()
}

export function AppHeader() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()

  const currentNav = flatNavItems.find(
    (item) => location.pathname === item.url
  )

  const handleLogout = () => {
    logout()
    navigate("/login", { replace: true })
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-4 data-vertical:self-center" />

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

      {/* Search */}
      <div className="relative ml-auto hidden w-56 lg:block">
        <HugeiconsIcon
          icon={Search02Icon}
          strokeWidth={2}
          className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        />
        <Input
          placeholder="Search..."
          className="h-8 border-transparent bg-muted pl-8 text-sm shadow-none focus-visible:border-input"
        />
      </div>

      <div className="ml-auto flex items-center gap-1 lg:ml-2">
        <Button variant="ghost" size="icon-sm" className="hidden sm:flex" aria-label="Notifications">
          <HugeiconsIcon icon={BellIcon} strokeWidth={2} />
        </Button>
        <ThemeToggle />
        <Separator orientation="vertical" className="mx-1 h-4 data-vertical:self-center" />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-1.5">
              <Avatar size="sm">
                {user?.avatar && (
                  <AvatarImage src={user.avatar} alt={user.name} />
                )}
                <AvatarFallback>{user ? getInitials(user.name) : "?"}</AvatarFallback>
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
                <AvatarFallback>{user ? getInitials(user.name) : "?"}</AvatarFallback>
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
            <DropdownMenuItem variant="destructive" onClick={handleLogout}>
              <HugeiconsIcon icon={Logout02Icon} strokeWidth={2} />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
