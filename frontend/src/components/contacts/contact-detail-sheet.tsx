import type { ComponentProps } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import { Call02Icon, Mail02Icon, StarIcon } from "@hugeicons/core-free-icons"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { STATUS_META, useContactsStore, type Contact } from "@/store/contacts"

type ContactDetailSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  contact: Contact | null
}

function getInitials(name: string) {
  return name.charAt(0).toUpperCase()
}

export function ContactDetailSheet({
  open,
  onOpenChange,
  contact,
}: ContactDetailSheetProps) {
  const toggleFavorite = useContactsStore((s) => s.toggleFavorite)
  const statusMeta = STATUS_META.find((s) => s.value === contact?.status)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg!">
        <SheetHeader>
          <SheetTitle>Contact details</SheetTitle>
          <SheetDescription>
            Workspace profile information from the users directory.
          </SheetDescription>
        </SheetHeader>

        {contact && (
          <div className="flex flex-col gap-5 overflow-y-auto px-6">
            <div className="flex items-center gap-4">
              <Avatar size="lg" className="size-16">
                <AvatarImage src={contact.avatar} alt={contact.name} />
                <AvatarFallback className="text-xl">
                  {getInitials(contact.name || "?")}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-base font-semibold">
                  {contact.name}
                </span>
                {contact.title && (
                  <span className="truncate text-sm text-muted-foreground">
                    {contact.title}
                  </span>
                )}
                <Badge variant={statusMeta?.variant} className="w-fit">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: statusMeta?.color }}
                  />
                  {statusMeta?.label}
                </Badge>
              </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">User ID</span>
              <span className="font-mono text-xs break-all text-muted-foreground">
                {contact.id}
              </span>
            </div>

            <Separator />

            <div className="flex flex-col gap-3">
              {contact.email && (
                <InfoRow icon={Mail02Icon} label={contact.email} />
              )}
              {contact.phone && (
                <InfoRow icon={Call02Icon} label={contact.phone} />
              )}
              {!contact.email && !contact.phone && (
                <p className="text-sm text-muted-foreground">
                  No public contact details have been added yet.
                </p>
              )}
            </div>

            {contact.notes && (
              <>
                <Separator />
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Bio</span>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                    {contact.notes}
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        <SheetFooter className="flex-row items-center justify-between gap-2">
          {contact ? (
            <Button
              variant="ghost"
              onClick={() => void toggleFavorite(contact.id)}
            >
              <HugeiconsIcon
                icon={StarIcon}
                strokeWidth={2}
                className={contact.favorite ? "text-amber-500" : undefined}
                fill={contact.favorite ? "currentColor" : "none"}
              />
              {contact.favorite ? "Unfavorite" : "Favorite"}
            </Button>
          ) : (
            <div />
          )}
          <SheetClose asChild>
            <Button variant="secondary">Close</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function InfoRow({
  icon,
  label,
}: {
  icon: ComponentProps<typeof HugeiconsIcon>["icon"]
  label: string
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  )
}
