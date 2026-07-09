import { BrowserRouter, Navigate, Route, Routes } from "react-router"

import { DashboardLayout } from "@/components/dashboard-layout"
import { ProtectedRoute } from "@/components/protected-route"
import { LoginPage } from "@/pages/login"
import { DashboardPage } from "@/pages/dashboard"
import { ChatPage } from "@/pages/chat"
import { BoardPage } from "@/pages/board"
import { DocsPage } from "@/pages/docs"
import { ContactsPage } from "@/pages/contacts"
import { CalendarPage } from "@/pages/calendar"
import { ReadingPage } from "@/pages/reading"
import { AIMicroAppsPage } from "@/pages/micro-apps"
import { SettingsPage } from "@/pages/settings"
import { ProfilePage } from "@/pages/profile"

export function AppRouter() {
  return (
    <BrowserRouter>
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
            <Route path="/micro-apps" element={<AIMicroAppsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
