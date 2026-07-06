import { useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import { Call02Icon, Delete02Icon, Location01Icon, Mail02Icon, StarIcon } from "@hugeicons/core-free-icons"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { STATUS_META, useContactsStore, type Contact, type ContactStatus } from "@/store/contacts"

type ContactDetailSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  contact: Contact | null
}

type FormState = {
  name: string
  email: string
  phone: string
  title: string
  company: string
  location: string
  website: string
  status: ContactStatus
  notes: string
  favorite: boolean
}

const emptyForm: FormState = {
  name: "",
  email: "",
  phone: "",
  title: "",
  company: "",
  location: "",
  website: "",
  status: "active",
  notes: "",
  favorite: false,
}

function formFromContact(contact: Contact | null): FormState {
  if (!contact) return { ...emptyForm }
  return {
    name: contact.name,
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    title: contact.title ?? "",
    company: contact.company ?? "",
    location: contact.location ?? "",
    website: contact.website ?? "",
    status: contact.status,
    notes: contact.notes ?? "",
    favorite: contact.favorite,
  }
}

function getInitials(name: string) {
  return name.charAt(0).toUpperCase()
}

export function ContactDetailSheet({ ...props }: ContactDetailSheetProps) {
  const formKey = props.open ? (props.contact?.id ?? "new") : "closed"
  return <ContactDetailSheetForm key={formKey} {...props} />
}

function ContactDetailSheetForm({ open, onOpenChange, contact }: ContactDetailSheetProps) {
  const addContact = useContactsStore((s) => s.addContact)
  const updateContact = useContactsStore((s) => s.updateContact)
  const removeContact = useContactsStore((s) => s.removeContact)

  const [form, setForm] = useState<FormState>(() => formFromContact(contact))
  const [confirmDelete, setConfirmDelete] = useState(false)

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    if (!form.name.trim()) return

    const data = {
      name: form.name.trim(),
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      title: form.title.trim() || undefined,
      company: form.company.trim() || undefined,
      location: form.location.trim() || undefined,
      website: form.website.trim() || undefined,
      status: form.status,
      notes: form.notes.trim() || undefined,
      favorite: form.favorite,
    }

    if (contact) {
      updateContact(contact.id, data)
    } else {
      addContact(data)
    }
    onOpenChange(false)
  }

  const handleDelete = () => {
    if (contact) {
      removeContact(contact.id)
      onOpenChange(false)
    }
  }

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      setForm(emptyForm)
    }
    onOpenChange(value)
  }

  const statusMeta = STATUS_META.find((s) => s.value === form.status)

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg!">
        <SheetHeader>
          <SheetTitle>{contact ? "Contact details" : "Add contact"}</SheetTitle>
          <SheetDescription>
            {contact ? "View or update the contact information below." : "Fill in the details for your new contact."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 overflow-y-auto px-6">
          {/* Avatar + name + status */}
          <div className="flex items-center gap-4">
            <Avatar size="lg" className="size-16">
              <AvatarImage src={contact?.avatar} alt={form.name} />
              <AvatarFallback className="text-xl">{getInitials(form.name || "?")}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-base font-semibold">{form.name || "New contact"}</span>
              {form.company && (
                <span className="truncate text-sm text-muted-foreground">
                  {form.title ? `${form.title} · ${form.company}` : form.company}
                </span>
              )}
              <Badge variant={statusMeta?.variant} className="w-fit">
                <span className="size-2 rounded-full" style={{ backgroundColor: statusMeta?.color }} />
                {statusMeta?.label}
              </Badge>
            </div>
          </div>

          {/* Quick info */}
          {(contact?.email || contact?.phone || contact?.location) && (
            <>
              <div className="flex flex-col gap-2">
                {contact.email && <InfoRow icon={Mail02Icon} label={contact.email} />}
                {contact.phone && <InfoRow icon={Call02Icon} label={contact.phone} />}
                {contact.location && <InfoRow icon={Location01Icon} label={contact.location} />}
              </div>
              <Separator />
            </>
          )}

          {/* Editable form fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-name">Name</Label>
              <Input
                id="contact-name"
                placeholder="Full name"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-title">Title</Label>
              <Input
                id="contact-title"
                placeholder="Product Designer"
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-company">Company</Label>
              <Input
                id="contact-company"
                placeholder="Acme Inc."
                value={form.company}
                onChange={(e) => setField("company", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setField("status", v as ContactStatus)}>
                <SelectTrigger className="w-full">
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ backgroundColor: statusMeta?.color }} />
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {STATUS_META.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                type="email"
                placeholder="name@example.com"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-phone">Phone</Label>
              <Input
                id="contact-phone"
                placeholder="+86 138 0000 0000"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-location">Location</Label>
              <Input
                id="contact-location"
                placeholder="Shanghai, China"
                value={form.location}
                onChange={(e) => setField("location", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-website">Website</Label>
              <Input
                id="contact-website"
                placeholder="example.com"
                value={form.website}
                onChange={(e) => setField("website", e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-notes">Notes</Label>
            <Textarea
              id="contact-notes"
              rows={3}
              placeholder="Add notes about this contact..."
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.favorite}
              onChange={(e) => setField("favorite", e.target.checked)}
              className="size-4 accent-amber-500"
            />
            <HugeiconsIcon icon={StarIcon} strokeWidth={2} className="size-4 text-amber-500" />
            Mark as favorite
          </label>
        </div>

        <SheetFooter className="flex-row items-center justify-between gap-2">
          {contact ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              Delete
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <SheetClose asChild>
              <Button variant="ghost">Cancel</Button>
            </SheetClose>
            <Button onClick={handleSave} disabled={!form.name.trim()}>
              {contact ? "Save changes" : "Add contact"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove "{contact?.name}" from your contacts. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}

function InfoRow({ icon, label }: { icon: React.ComponentProps<typeof HugeiconsIcon>["icon"]; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  )
}
