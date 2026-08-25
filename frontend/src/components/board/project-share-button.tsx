import { useEffect, useState } from "react"
import { toast } from "sonner"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Copy01Icon,
  LinkSquare02Icon,
  Share01Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { pb } from "@/lib/pocketbase"
import { cn } from "@/lib/utils"
import type { Project } from "@/store/board"

type ProjectShare = {
  projectId: string
  slug: string
  expires?: string
  created: string
  updated: string
}

/** "keep" leaves an existing expiry untouched while other fields change. */
type ShareExpiry = "keep" | "never" | "7" | "30"

/**
 * Publishes a project as a public preview. Unlike a shared document, the link
 * always shows the project as it stands, so there is no revision to publish
 * again — only an expiry to set and a link to revoke. The share is loaded on
 * mount rather than when the dialog opens, so the icon can already report that
 * this project is public.
 */
export function ShareProjectButton({ project }: { project: Project }) {
  const [open, setOpen] = useState(false)
  // Tied to the project it describes, so a re-render for another project never
  // shows the previous project's link as if it were this one's.
  const [loaded, setLoaded] = useState<{
    projectId: string
    share: ProjectShare | null
  } | null>(null)
  const [expiry, setExpiry] = useState<ShareExpiry>("never")
  const [chineseDates, setChineseDates] = useState(false)
  const [working, setWorking] = useState(false)
  const current = loaded?.projectId === project.id ? loaded : null
  const share = current?.share ?? null

  useEffect(() => {
    let active = true
    void pb
      .send<ProjectShare | null>(`/api/board/projects/${project.id}/share`, {})
      .then((existing) => {
        if (!active) return
        setLoaded({ projectId: project.id, share: existing })
        setExpiry(existing?.expires ? "keep" : "never")
      })
      .catch(() => {
        // A project that cannot report its share simply shows an unshared
        // icon; the dialog surfaces any real failure when it is opened.
      })
    return () => {
      active = false
    }
  }, [project.id])

  const publish = async (nextExpiry: ShareExpiry) => {
    setWorking(true)
    try {
      const updated = await pb.send<ProjectShare>(
        `/api/board/projects/${project.id}/share`,
        {
          method: "POST",
          body: { expires: shareExpiryValue(nextExpiry, share) },
        }
      )
      setLoaded({ projectId: project.id, share: updated })
      setExpiry(updated.expires ? "keep" : "never")
      toast.success(share ? "Link updated." : "Link created.")
    } catch {
      toast.error("Could not update the share link.")
    } finally {
      setWorking(false)
    }
  }

  const revoke = async () => {
    setWorking(true)
    try {
      await pb.send(`/api/board/projects/${project.id}/share`, {
        method: "DELETE",
      })
      setLoaded({ projectId: project.id, share: null })
      setExpiry("never")
      toast.success("Link revoked.")
    } catch {
      toast.error("Could not revoke the share link.")
    } finally {
      setWorking(false)
    }
  }

  // The language parameter only formats dates, so it belongs to the link the
  // owner hands out rather than to the share record.
  const url = share
    ? `${window.location.origin}/p/${share.slug}${chineseDates ? "?lang=zh" : ""}`
    : ""

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Link copied.")
    } catch {
      toast.error("Could not copy to clipboard.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={
                share ? `${project.name} is shared publicly` : "Share project"
              }
              onClick={() => setOpen(true)}
              className={cn(
                share && "text-emerald-500 hover:text-emerald-500"
              )}
            >
              <HugeiconsIcon icon={Share01Icon} strokeWidth={2} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {share ? "Shared publicly" : "Share project"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share project</DialogTitle>
          <DialogDescription>
            Anyone with the link sees this project as it stands right now,
            without signing in.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border/60 p-3 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Visible:</span> task
            titles and descriptions, states, labels, dates, and member names
            with their avatars.
          </p>
          <p className="mt-1">
            <span className="font-medium text-foreground">Not visible:</span>{" "}
            archived tasks, activity records, who a task is assigned to, and
            member emails and roles.
          </p>
          <p className="mt-1">
            Archiving or deleting the project takes the link down immediately.
          </p>
        </div>

        {!current ? (
          <div className="flex justify-center py-6">
            <Spinner className="size-5" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {share && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={url}
                    onFocus={(e) => e.target.select()}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Copy link"
                    title="Copy link"
                    onClick={() => void copy()}
                  >
                    <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Open in a new tab"
                    title="Open in a new tab"
                    onClick={() =>
                      window.open(url, "_blank", "noopener,noreferrer")
                    }
                  >
                    <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={2} />
                  </Button>
                </div>
                <Label className="flex items-start gap-2 text-xs font-normal text-muted-foreground">
                  <Checkbox
                    checked={chineseDates}
                    onCheckedChange={(value) => setChineseDates(value === true)}
                    className="mt-0.5"
                  />
                  <span>
                    Add <code className="font-mono">?lang=zh</code> so the page
                    reads its dates in Chinese (中文日期格式). Without it the
                    dates read in English.
                  </span>
                </Label>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label>Expires</Label>
              <Select
                value={expiry}
                onValueChange={(value) => {
                  const next = value as ShareExpiry
                  setExpiry(next)
                  if (share) void publish(next)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {share?.expires && (
                    <SelectItem value="keep">
                      {formatShareExpiry(share.expires)}
                    </SelectItem>
                  )}
                  <SelectItem value="never">No expiry</SelectItem>
                  <SelectItem value="7">7 days from now</SelectItem>
                  <SelectItem value="30">30 days from now</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          {share ? (
            <Button
              variant="outline"
              disabled={working}
              onClick={() => void revoke()}
              title="The current link stops working and cannot be restored."
            >
              Revoke link
            </Button>
          ) : (
            <Button
              disabled={working || !current}
              onClick={() => void publish(expiry)}
            >
              {working ? "Creating…" : "Create link"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function shareExpiryValue(
  expiry: ShareExpiry,
  share: ProjectShare | null
): string {
  if (expiry === "keep") return share?.expires ?? ""
  if (expiry === "never") return ""
  const expires = new Date()
  expires.setDate(expires.getDate() + Number(expiry))
  return expires.toISOString()
}

function formatShareExpiry(value: string): string {
  const parsed = new Date(value.replace(" ", "T"))
  if (Number.isNaN(parsed.getTime())) return "Keep current expiry"
  return `Keep ${parsed.toLocaleDateString()}`
}
