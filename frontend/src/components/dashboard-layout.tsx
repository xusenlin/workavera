import { Outlet, useLocation } from "react-router"

import { AppSidebar } from "@/components/app-sidebar"
import { AppHeader } from "@/components/app-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export function DashboardLayout() {
  const { pathname } = useLocation()
  const isFullBleed = pathname.startsWith("/chat")

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          {isFullBleed ? (
            <Outlet />
          ) : (
            <div className="mx-auto w-full max-w-7xl">
              <Outlet />
            </div>
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
