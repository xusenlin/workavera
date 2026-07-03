import { BrowserRouter, Navigate, Route, Routes } from "react-router"

import { DashboardLayout } from "@/components/dashboard-layout"
import { ProtectedRoute } from "@/components/protected-route"
import { LoginPage } from "@/pages/login"
import { DashboardPage } from "@/pages/dashboard"
import { BoardPage } from "@/pages/board"
import { NotesPage } from "@/pages/notes"
import { ChatPage } from "@/pages/chat"
import { BlogPage } from "@/pages/blog"
import { CalendarPage } from "@/pages/calendar"
import { ReadingPage } from "@/pages/reading"
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
            <Route path="/board" element={<BoardPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/blog" element={<BlogPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/reading" element={<ReadingPage />} />
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
