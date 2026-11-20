import { useEffect, useState } from "react"
import { toast } from "sonner"

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
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { resourceErrorMessage, type Resource } from "@/lib/resources"
import type { ResourceLease } from "@/lib/resources"
import { useResourcesStore } from "@/store/resources"

type DialogProps = {
  resource: Resource | null
  onOpenChange: (open: boolean) => void
}

export function RenameResourceDialog({ resource, onOpenChange }: DialogProps) {
  const rename = useResourcesStore((state) => state.rename)
  const [name, setName] = useState(resource?.display_name ?? "")
  const [saving, setSaving] = useState(false)

  const trimmed = name.trim()
  const submit = async () => {
    if (!resource || !trimmed || saving) return
    setSaving(true)
    try {
      await rename(resource.id, trimmed)
      toast.success("Resource renamed")
      onOpenChange(false)
    } catch (error) {
      toast.error(resourceErrorMessage(error, "Could not rename resource."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={resource !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename resource</DialogTitle>
          <DialogDescription>
            The new name is used from now on. Past messages keep the name the
            file had when it was sent.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Input
            value={name}
            maxLength={255}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
        </form>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button disabled={!trimmed || saving} onClick={() => void submit()}>
            {saving && <Spinner />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteResourceDialog({ resource, onOpenChange }: DialogProps) {
  const remove = useResourcesStore((state) => state.remove)
  const [deleting, setDeleting] = useState(false)

  const confirm = async () => {
    if (!resource) return
    setDeleting(true)
    try {
      await remove(resource.id)
      toast.success("Resource deleted")
      onOpenChange(false)
    } catch (error) {
      toast.error(resourceErrorMessage(error, "Could not delete resource."))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog
      open={resource !== null}
      onOpenChange={(open) => {
        if (!deleting) onOpenChange(open)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete “{resource?.display_name}”?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The file is deleted permanently, and every download link for it
            stops working. Messages that attached it stay, but their attachment
            cards will show it as unavailable.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={(event) => {
              event.preventDefault()
              void confirm()
            }}
          >
            {deleting && <Spinner />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function remainingTime(expiresAt: string, now: number) {
  const seconds = Math.max(
    0,
    Math.round((new Date(expiresAt).getTime() - now) / 1000)
  )
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`
}

export function ResourceLinksDialog({ resource, onOpenChange }: DialogProps) {
  const fetchLeases = useResourcesStore((state) => state.fetchLeases)
  const revokeLease = useResourcesStore((state) => state.revokeLease)
  const [leases, setLeases] = useState<ResourceLease[] | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!resource) return
    let cancelled = false
    fetchLeases(resource.id)
      .then((items) => {
        if (!cancelled) setLeases(items)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setLeases([])
        toast.error(resourceErrorMessage(error, "Could not load links."))
      })
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [fetchLeases, resource])

  const active = (leases ?? []).filter(
    (lease) => new Date(lease.expires_at).getTime() > now
  )

  const revoke = async (lease: ResourceLease) => {
    setRevoking(lease.id)
    try {
      await revokeLease(lease.id)
      setLeases((items) => items?.filter((item) => item.id !== lease.id) ?? [])
      toast.success("Link revoked")
    } catch (error) {
      toast.error(resourceErrorMessage(error, "Could not revoke link."))
    } finally {
      setRevoking(null)
    }
  }

  return (
    <Dialog open={resource !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Download links</DialogTitle>
          <DialogDescription>
            Links the assistant created for “{resource?.display_name}”. Anyone
            with a link can download the file until it expires.
          </DialogDescription>
        </DialogHeader>
        {leases === null ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : active.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No active download links.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {active.map((lease) => (
              <li
                key={lease.id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm break-words">{lease.purpose}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Expires in {remainingTime(lease.expires_at, now)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={revoking === lease.id}
                  onClick={() => void revoke(lease)}
                >
                  {revoking === lease.id && <Spinner />}
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
