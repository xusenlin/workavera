import { useMemo, useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  Edit01Icon,
  Mail02Icon,
  MoreHorizontalIcon,
  Search02Icon,
  StarIcon,
} from "@hugeicons/core-free-icons"

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { STATUS_META, useContactsStore, type Contact } from "@/store/contacts"

function getInitials(name: string) {
  return name.charAt(0).toUpperCase()
}

function statusMeta(status: Contact["status"]) {
  return STATUS_META.find((s) => s.value === status)
}

function ContactCard({
  contact,
  onClick,
}: {
  contact: Contact
  onClick: () => void
}) {
  const toggleFavorite = useContactsStore((s) => s.toggleFavorite)
  const removeContact = useContactsStore((s) => s.removeContact)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const meta = statusMeta(contact.status)

  return (
    <>
      <div
        className="group relative flex cursor-pointer flex-col gap-3 rounded-xl border bg-card p-4 transition-all hover:border-border/80 hover:shadow-sm"
        onClick={onClick}
      >
        <div className="flex items-start gap-3">
          <Avatar size="lg" className="size-11">
            {contact.avatar && <AvatarImage src={contact.avatar} alt={contact.name} />}
            <AvatarFallback className="text-base">
              {getInitials(contact.name)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-medium">{contact.name}</span>
              {contact.favorite && (
                <HugeiconsIcon
                  icon={StarIcon}
                  strokeWidth={2}
                  className="size-3.5 shrink-0 text-amber-500"
                  fill="currentColor"
                />
              )}
            </div>
            {contact.title && (
              <p className="text-muted-foreground truncate text-sm">
                {contact.title}
                {contact.company ? ` · ${contact.company}` : ""}
              </p>
            )}
          </div>

          {/* Action menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={onClick}>
                <HugeiconsIcon icon={Edit01Icon} strokeWidth={2} />
                View / Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => toggleFavorite(contact.id)}
              >
                <HugeiconsIcon icon={StarIcon} strokeWidth={2} />
                {contact.favorite ? "Unfavorite" : "Favorite"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={meta?.variant}>
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: meta?.color }}
            />
            {meta?.label}
          </Badge>
          {contact.email && (
            <span className="text-muted-foreground flex items-center gap-1 truncate text-xs">
              <HugeiconsIcon icon={Mail02Icon} strokeWidth={2} className="size-3" />
              <span className="truncate">{contact.email}</span>
            </span>
          )}
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove "{contact.name}" from your contacts.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => removeContact(contact.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ContactSection({
  label,
  contacts,
  onSelect,
}: {
  label: string
  contacts: Contact[]
  onSelect: (contact: Contact) => void
}) {
  if (contacts.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </span>
        <span className="text-muted-foreground/60 text-xs">{contacts.length}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {contacts.map((contact) => (
          <ContactCard
            key={contact.id}
            contact={contact}
            onClick={() => onSelect(contact)}
          />
        ))}
      </div>
    </div>
  )
}

export function ContactList({
  onSelect,
}: {
  onSelect: (contact: Contact | null) => void
}) {
  const contacts = useContactsStore((s) => s.contacts)

  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const { favorites, all } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? contacts.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.email?.toLowerCase().includes(q) ||
            c.company?.toLowerCase().includes(q) ||
            c.title?.toLowerCase().includes(q)
        )
      : contacts

    const byStatus =
      statusFilter === "all"
        ? filtered
        : filtered.filter((c) => c.status === statusFilter)

    const sorted = [...byStatus].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    return {
      favorites: sorted.filter((c) => c.favorite),
      all: sorted.filter((c) => !c.favorite),
    }
  }, [contacts, query, statusFilter])

  const hasResults = favorites.length > 0 || all.length > 0

  return (
    <div className="flex flex-col gap-4">
      {/* Search + filter */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <HugeiconsIcon
            icon={Search02Icon}
            strokeWidth={2}
            className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          />
          <Input
            placeholder="Search contacts by name, email, company..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            label="All"
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          />
          {STATUS_META.map((s) => (
            <FilterChip
              key={s.value}
              label={s.label}
              color={s.color}
              active={statusFilter === s.value}
              onClick={() => setStatusFilter(s.value)}
            />
          ))}
        </div>
      </div>

      {/* List */}
      {hasResults ? (
        <div className="flex flex-col gap-6">
          <ContactSection
            label="Favorites"
            contacts={favorites}
            onSelect={onSelect}
          />
          <ContactSection label="All contacts" contacts={all} onSelect={onSelect} />
        </div>
      ) : (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-center text-sm">
          <HugeiconsIcon
            icon={Search02Icon}
            strokeWidth={2}
            className="size-6 opacity-50"
          />
          <p>No contacts found</p>
          {query && (
            <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
              Clear search
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  label,
  color,
  active,
  onClick,
}: {
  label: string
  color?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-foreground text-background border-foreground"
          : "text-muted-foreground hover:bg-muted border-border"
      )}
    >
      {color && (
        <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      )}
      {label}
    </button>
  )
}
