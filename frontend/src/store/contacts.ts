import { create } from "zustand"
import { persist } from "zustand/middleware"

export type ContactStatus = "active" | "inactive" | "vip" | "lead"

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
  addContact: (contact: Omit<Contact, "id" | "createdAt">) => string
  updateContact: (id: string, patch: Partial<Omit<Contact, "id">>) => void
  removeContact: (id: string) => void
  toggleFavorite: (id: string) => void
}

function generateId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function iso(daysAgo: number) {
  return new Date(Date.now() - 86400000 * daysAgo).toISOString()
}

// Seed data for first-time users
const seedContacts: Contact[] = [
  {
    id: "contact_1",
    name: "Alice Chen",
    email: "alice.chen@nimbus.ai",
    phone: "+86 138 0011 2233",
    title: "Product Manager",
    company: "Nimbus AI",
    location: "Shanghai, China",
    website: "nimbus.ai",
    status: "vip",
    notes: "Key decision-maker for the enterprise tier. Prefers email over calls.",
    favorite: true,
    createdAt: iso(42),
  },
  {
    id: "contact_2",
    name: "Bob Wang",
    email: "bob.wang@helios.dev",
    phone: "+86 139 8888 7766",
    title: "CTO",
    company: "Helios Labs",
    location: "Beijing, China",
    website: "helios.dev",
    status: "active",
    notes: "Interested in the collaboration features. Loop in the engineering team.",
    favorite: true,
    createdAt: iso(30),
  },
  {
    id: "contact_3",
    name: "Diana Liu",
    email: "diana@studiolunar.co",
    phone: "+1 415 555 0199",
    title: "Design Lead",
    company: "Studio Lunar",
    location: "San Francisco, USA",
    website: "studiolunar.co",
    status: "active",
    notes: "Owns the brand refresh. Shares design tokens via Figma.",
    favorite: false,
    createdAt: iso(20),
  },
  {
    id: "contact_4",
    name: "Eric Zhang",
    email: "eric.z@quantumforge.io",
    phone: "+86 188 0000 1234",
    title: "Engineering Manager",
    company: "Quantum Forge",
    location: "Shenzhen, China",
    status: "lead",
    notes: "Evaluating the platform for his team. Needs a demo next week.",
    favorite: false,
    createdAt: iso(12),
  },
  {
    id: "contact_5",
    name: "Fiona Park",
    email: "fiona@brightwave.media",
    title: "Marketing Director",
    company: "Brightwave Media",
    location: "Seoul, South Korea",
    website: "brightwave.media",
    status: "lead",
    notes: "Reached out via the website contact form. Follow up with pricing.",
    favorite: false,
    createdAt: iso(7),
  },
  {
    id: "contact_6",
    name: "Marcus Reed",
    email: "marcus@orbitalventures.com",
    phone: "+44 20 7946 0823",
    title: "Partner",
    company: "Orbital Ventures",
    location: "London, UK",
    status: "vip",
    notes: "Investor. Quarterly check-ins scheduled.",
    favorite: true,
    createdAt: iso(60),
  },
  {
    id: "contact_7",
    name: "Sara Ahmed",
    email: "sara.ahmed@devotion.com",
    phone: "+971 50 123 4567",
    title: "Head of Operations",
    company: "Devotion",
    location: "Dubai, UAE",
    status: "active",
    notes: "Procurement lead for the MENA region.",
    favorite: false,
    createdAt: iso(4),
  },
  {
    id: "contact_8",
    name: "Tom Becker",
    email: "tom.becker@northpeak.de",
    title: "Freelance Developer",
    company: "Northpeak",
    location: "Berlin, Germany",
    website: "northpeak.de",
    status: "inactive",
    notes: "Previous integration partner. Project on hold.",
    favorite: false,
    createdAt: iso(90),
  },
]

export const useContactsStore = create<ContactState>()(
  persist(
    (set) => ({
      contacts: seedContacts,

      addContact: (contact) => {
        const id = generateId("contact")
        set((state) => ({
          contacts: [{ ...contact, id, createdAt: new Date().toISOString() }, ...state.contacts],
        }))
        return id
      },

      updateContact: (id, patch) =>
        set((state) => ({
          contacts: state.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),

      removeContact: (id) =>
        set((state) => ({
          contacts: state.contacts.filter((c) => c.id !== id),
        })),

      toggleFavorite: (id) =>
        set((state) => ({
          contacts: state.contacts.map((c) => (c.id === id ? { ...c, favorite: !c.favorite } : c)),
        })),
    }),
    {
      name: "contacts-storage",
      version: 1,
      migrate: () => ({ contacts: seedContacts }),
    }
  )
)

export const STATUS_META: {
  value: ContactStatus
  label: string
  color: string
  variant: "default" | "secondary" | "destructive" | "outline" | "ghost"
}[] = [
  { value: "active", label: "Active", color: "#22c55e", variant: "secondary" },
  { value: "vip", label: "VIP", color: "#f59e0b", variant: "default" },
  { value: "lead", label: "Lead", color: "#3b82f6", variant: "outline" },
  { value: "inactive", label: "Inactive", color: "#64748b", variant: "ghost" },
]
