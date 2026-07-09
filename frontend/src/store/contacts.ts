import { ClientResponseError, type RecordModel } from "pocketbase"
import { toast } from "sonner"
import { create } from "zustand"

import { pb } from "@/lib/pocketbase"

export type ContactStatus = "online" | "away" | "busy" | "offline"

type UserContactRecord = RecordModel & {
  name: string
  email: string
  avatar: string
  phone?: string
  title?: string
  bio?: string
  status?: ContactStatus
}

type ContactFavoriteRecord = RecordModel & {
  owner: string
  contact: string
}

export type Contact = {
  id: string
  name: string
  email?: string
  phone?: string
  title?: string
  company?: string
  location?: string
  website?: string
  avatar?: string
  status: ContactStatus
  notes?: string
  favorite: boolean
  createdAt: string
}

type ContactState = {
  contacts: Contact[]
  favoriteRecords: Record<string, string>
  loading: boolean
  error: string | null
  fetchContacts: () => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
}

function errorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : fallback
  }
  return error.response?.message || fallback
}

function toContact(record: UserContactRecord, favorite: boolean): Contact {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    phone: record.phone || undefined,
    title: record.title || undefined,
    avatar: record.avatar ? pb.files.getURL(record, record.avatar) : undefined,
    status: record.status || "offline",
    notes: record.bio || undefined,
    favorite,
    createdAt: record.created,
  }
}

export const useContactsStore = create<ContactState>((set, get) => ({
  contacts: [],
  favoriteRecords: {},
  loading: false,
  error: null,

  fetchContacts: async () => {
    set({ loading: true, error: null })
    try {
      const [records, favorites] = await Promise.all([
        pb.collection("users").getFullList<UserContactRecord>({
          sort: "name",
          requestKey: null,
        }),
        pb.collection("contact_favorites").getFullList<ContactFavoriteRecord>({
          sort: "-created",
          requestKey: null,
        }),
      ])
      const favoriteRecords = Object.fromEntries(
        favorites.map((favorite) => [favorite.contact, favorite.id])
      )
      set({
        contacts: records.map((record) =>
          toContact(record, favoriteRecords[record.id] != null)
        ),
        favoriteRecords,
        loading: false,
      })
    } catch (error) {
      const message = errorMessage(error, "Could not load contacts")
      set({ loading: false, error: message })
      toast.error(message)
    }
  },

  toggleFavorite: async (id) => {
    const ownerId = pb.authStore.record?.id
    if (!ownerId) {
      toast.error("You must be signed in to favorite contacts")
      return
    }
    if (id === ownerId) {
      toast.error("You cannot favorite yourself")
      return
    }

    const existingFavoriteId = get().favoriteRecords[id]
    try {
      if (existingFavoriteId) {
        await pb.collection("contact_favorites").delete(existingFavoriteId)
        set((state) => {
          const favoriteRecords = { ...state.favoriteRecords }
          delete favoriteRecords[id]
          return {
            favoriteRecords,
            contacts: state.contacts.map((contact) =>
              contact.id === id ? { ...contact, favorite: false } : contact
            ),
          }
        })
        return
      }

      const favorite = await pb
        .collection("contact_favorites")
        .create<ContactFavoriteRecord>({
          owner: ownerId,
          contact: id,
        })
      set((state) => ({
        favoriteRecords: { ...state.favoriteRecords, [id]: favorite.id },
        contacts: state.contacts.map((contact) =>
          contact.id === id ? { ...contact, favorite: true } : contact
        ),
      }))
    } catch (error) {
      toast.error(errorMessage(error, "Could not update favorite"))
    }
  },
}))

export const STATUS_META: {
  value: ContactStatus
  label: string
  color: string
  variant: "default" | "secondary" | "destructive" | "outline" | "ghost"
}[] = [
  { value: "online", label: "Online", color: "#22c55e", variant: "secondary" },
  { value: "away", label: "Away", color: "#f59e0b", variant: "default" },
  { value: "busy", label: "Busy", color: "#ef4444", variant: "destructive" },
  { value: "offline", label: "Offline", color: "#64748b", variant: "ghost" },
]
