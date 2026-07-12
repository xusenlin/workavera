import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { toast } from "sonner"

import { HugeiconsIcon } from "@hugeicons/react"
import { ContactBookIcon } from "@hugeicons/core-free-icons"

import { ContactDetailSheet } from "@/components/contacts/contact-detail-sheet"
import { ContactList } from "@/components/contacts/contact-list"
import {
  requestedRecordId,
  workspaceRecordUrl,
} from "@/lib/workspace-navigation"
import { useContactsStore, type Contact } from "@/store/contacts"

export function ContactsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedContactId = requestedRecordId(searchParams)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [contactsLoaded, setContactsLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const contacts = useContactsStore((s) => s.contacts)
  const fetchContacts = useContactsStore((s) => s.fetchContacts)
  const selected = contacts.find((contact) => contact.id === selectedId) ?? null

  useEffect(() => {
    void fetchContacts().finally(() => setContactsLoaded(true))
  }, [fetchContacts])

  useEffect(() => {
    if (
      !contactsLoaded ||
      !requestedContactId ||
      requestedContactId === selectedId
    )
      return
    const contact = contacts.find((item) => item.id === requestedContactId)
    if (!contact) {
      toast.error("Could not open contact.")
      navigate("/contacts", { replace: true })
      return
    }
    void Promise.resolve().then(() => {
      setSelectedId(contact.id)
      setSheetOpen(true)
    })
  }, [contacts, contactsLoaded, navigate, requestedContactId, selectedId])

  const handleSelect = (contact: Contact | null) => {
    setSelectedId(contact?.id ?? null)
    setSheetOpen(true)
    if (contact) {
      navigate(workspaceRecordUrl("contacts", contact.id), { replace: true })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <HugeiconsIcon
                icon={ContactBookIcon}
                strokeWidth={2}
                className="size-4"
              />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
            <span className="text-sm text-muted-foreground">
              {contacts.length}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Browse teammates and the people connected to your workspace.
          </p>
        </div>
      </div>

      <ContactList onSelect={handleSelect} />

      <ContactDetailSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open)
          if (!open) navigate("/contacts", { replace: true })
        }}
        contact={selected}
      />
    </div>
  )
}
