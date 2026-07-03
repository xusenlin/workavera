import { create } from "zustand"
import { persist } from "zustand/middleware"

export type UserStatus = "online" | "away" | "busy" | "offline"

export type User = {
  id: string
  name: string
  email: string
  avatar?: string
  phone?: string
  status?: UserStatus
}

type AuthState = {
  user: User | null
  isAuthenticated: boolean
  password: string
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  updateUser: (patch: Partial<User>) => void
  updatePassword: (newPassword: string) => void
}

// Demo credentials — replace with a real API call in production.
const DEMO_EMAIL = "demo@workavera.com"
const DEMO_PASSWORD = "password"

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      password: DEMO_PASSWORD,
      login: async (email, password) => {
        // Simulate a network request.
        await new Promise((resolve) => setTimeout(resolve, 600))

        if (email.trim().toLowerCase() !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
          throw new Error("Invalid email or password")
        }

        const user: User = {
          id: "u_1",
          name: "Senlin Xu",
          email: DEMO_EMAIL,
          phone: "+86 138 0000 0000",
          status: "online",
        }

        set({ user, isAuthenticated: true, password: DEMO_PASSWORD })
      },
      logout: () => set({ user: null, isAuthenticated: false }),
      updateUser: (patch) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...patch } : state.user,
        })),
      updatePassword: (newPassword) => set({ password: newPassword }),
    }),
    {
      name: "auth-storage",
    }
  )
)
