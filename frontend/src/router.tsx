import { lazy, Suspense } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router"

import { DashboardLayout } from "@/components/dashboard-layout"
import { ProtectedRoute } from "@/components/protected-route"
import { Spinner } from "@/components/ui/spinner"

const LoginPage = lazy(() =>
  import("@/pages/login").then((module) => ({ default: module.LoginPage }))
)
const DashboardPage = lazy(() =>
  import("@/pages/dashboard").then((module) => ({
    default: module.DashboardPage,
  }))
)
const ChatPage = lazy(() =>
  import("@/pages/chat").then((module) => ({ default: module.ChatPage }))
)
const BoardPage = lazy(() =>
  import("@/pages/board").then((module) => ({ default: module.BoardPage }))
)
const ContactsPage = lazy(() =>
  import("@/pages/contacts").then((module) => ({
    default: module.ContactsPage,
  }))
)
const CalendarPage = lazy(() =>
  import("@/pages/calendar").then((module) => ({
    default: module.CalendarPage,
  }))
)
const ReadingPage = lazy(() =>
  import("@/pages/reading").then((module) => ({
    default: module.ReadingPage,
  }))
)
const SettingsPage = lazy(() =>
  import("@/pages/settings").then((module) => ({
    default: module.SettingsPage,
  }))
)
const ProfilePage = lazy(() =>
  import("@/pages/profile").then((module) => ({
    default: module.ProfilePage,
  }))
)
const NotificationsPage = lazy(() =>
  import("@/pages/notifications").then((module) => ({
    default: module.NotificationsPage,
  }))
)

const DocsPage = lazy(() =>
  import("@/pages/docs").then((module) => ({ default: module.DocsPage }))
)

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense
        fallback={
          <div className="flex min-h-svh items-center justify-center">
            <Spinner className="size-6" />
          </div>
        }
      >
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/board" element={<BoardPage />} />
              <Route path="/docs" element={<DocsPage />} />
              <Route path="/contacts" element={<ContactsPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/reading" element={<ReadingPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
