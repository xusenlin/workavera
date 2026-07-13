import { create } from "zustand"
import { ClientResponseError, type RecordModel } from "pocketbase"

import { validateAvatarFile } from "@/lib/avatar"
import { pb } from "@/lib/pocketbase"

export type UserStatus = "online" | "away" | "busy" | "offline"
export type Theme = "system" | "light" | "dark"

const THEME_VALUES: Theme[] = ["system", "light", "dark"]

function toTheme(value: string | undefined): Theme {
  return THEME_VALUES.includes(value as Theme) ? (value as Theme) : "system"
}

type UserRecord = RecordModel & {
  name: string
  email: string
  avatar: string
  phone?: string
  title?: string
  bio?: string
  status?: UserStatus
  theme?: string
}

export type User = {
  id: string
  name: string
  email: string
  avatar?: string
  phone?: string
  title?: string
  bio?: string
  status?: UserStatus
  theme: Theme
}

export type ProfileUpdate = {
  name: string
  phone: string
  title: string
  bio: string
  status: UserStatus
  avatar?: File
}

type AuthState = {
  user: User | null
  isAuthenticated: boolean
  initialized: boolean
  initialize: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  updateProfile: (profile: ProfileUpdate) => Promise<User>
  updateTheme: (theme: Theme) => Promise<void>
  updatePassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<void>
}

let initializationPromise: Promise<void> | null = null

function toUser(record: UserRecord): User {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    avatar: record.avatar ? pb.files.getURL(record, record.avatar) : undefined,
    phone: record.phone || undefined,
    title: record.title || undefined,
    bio: record.bio || undefined,
    status: record.status || undefined,
    theme: toTheme(record.theme),
  }
}

function errorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : fallback
  }

  const fieldError = Object.values(error.response?.data ?? {}).find(
    (value): value is { message: string } =>
      typeof value === "object" &&
      value !== null &&
      "message" in value &&
      typeof value.message === "string"
  )

  return fieldError?.message || error.response?.message || fallback
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return
    if (initializationPromise) return initializationPromise

    initializationPromise = (async () => {
      try {
        if (!pb.authStore.isValid) {
          pb.authStore.clear()
          set({ user: null, isAuthenticated: false })
          return
        }

        const auth = await pb.collection("users").authRefresh<UserRecord>()
        set({ user: toUser(auth.record), isAuthenticated: true })
      } catch {
        pb.authStore.clear()
        set({ user: null, isAuthenticated: false })
      } finally {
        set({ initialized: true })
      }
    })()

    try {
      await initializationPromise
    } finally {
      initializationPromise = null
    }
  },

  login: async (email, password) => {
    try {
      const auth = await pb
        .collection("users")
        .authWithPassword<UserRecord>(email.trim(), password)
      set({
        user: toUser(auth.record),
        isAuthenticated: true,
        initialized: true,
      })
    } catch (error) {
      throw new Error(errorMessage(error, "Invalid email or password"), {
        cause: error,
      })
    }
  },

  logout: () => {
    pb.authStore.clear()
    set({ user: null, isAuthenticated: false, initialized: true })
  },

  updateProfile: async (profile) => {
    const user = get().user
    if (!user) throw new Error("You are not signed in")
    if (profile.avatar) {
      const avatarError = validateAvatarFile(profile.avatar)
      if (avatarError) throw new Error(avatarError)
    }

    const body = new FormData()
    body.set("name", profile.name.trim())
    body.set("phone", profile.phone.trim())
    body.set("title", profile.title.trim())
    body.set("bio", profile.bio.trim())
    body.set("status", profile.status)
    if (profile.avatar) body.set("avatar", profile.avatar)

    try {
      const record = await pb
        .collection("users")
        .update<UserRecord>(user.id, body)
      const updatedUser = toUser(record)
      set({ user: updatedUser, isAuthenticated: true })
      return updatedUser
    } catch (error) {
      throw new Error(errorMessage(error, "Could not save your profile"), {
        cause: error,
      })
    }
  },

  updateTheme: async (theme) => {
    const user = get().user
    if (!user || user.theme === theme) return
    // Optimistically reflect the choice; the caller applies it to the UI.
    set({ user: { ...user, theme } })
    try {
      await pb.collection("users").update<UserRecord>(user.id, { theme })
    } catch (error) {
      set({ user: { ...user } })
      throw new Error(errorMessage(error, "Could not save your theme"), {
        cause: error,
      })
    }
  },

  updatePassword: async (currentPassword, newPassword) => {
    const user = get().user
    if (!user) throw new Error("You are not signed in")

    try {
      await pb.collection("users").update<UserRecord>(user.id, {
        oldPassword: currentPassword,
        password: newPassword,
        passwordConfirm: newPassword,
      })
    } catch (error) {
      throw new Error(errorMessage(error, "Could not update your password"), {
        cause: error,
      })
    }

    try {
      const auth = await pb
        .collection("users")
        .authWithPassword<UserRecord>(user.email, newPassword)
      set({ user: toUser(auth.record), isAuthenticated: true })
    } catch (error) {
      pb.authStore.clear()
      set({ user: null, isAuthenticated: false })
      throw new Error(
        "Your password was updated. Sign in again with your new password.",
        { cause: error }
      )
    }
  },
}))
