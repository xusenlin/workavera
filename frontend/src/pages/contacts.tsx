import { useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, ContactBookIcon } from "@hugeicons/core-free-icons"

import { ContactDetailSheet } from "@/components/contacts/contact-detail-sheet"
import { ContactList } from "@/components/contacts/contact-list"
import { Button } from "@/components/ui/button"
import { useContactsStore, type Contact } from "@/store/contacts"

export function ContactsPage() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selected, setSelected] = useState<Contact | null>(null)

  const contacts = useContactsStore((s) => s.contacts)

  const handleSelect = (contact: Contact | null) => {
    setSelected(contact)
    setSheetOpen(true)
  }

  const handleAdd = () => {
    setSelected(null)
    setSheetOpen(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
              <HugeiconsIcon icon={ContactBookIcon} strokeWidth={2} className="size-4" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
            <span className="text-muted-foreground text-sm">
              {contacts.length}
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            Manage clients, partners, and the people connected to your work.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={handleAdd}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
          Add contact
        </Button>
      </div>

      <ContactList onSelect={handleSelect} />

      <ContactDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        contact={selected}
      />
    </div>
  )
}
