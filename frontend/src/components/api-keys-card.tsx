import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  AlertCircleIcon,
  Copy01Icon,
  Delete02Icon,
  Key01Icon,
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { pb } from "@/lib/pocketbase"

type ApiKeyRecord = {
  id: string
  name: string
  prefix: string
  allow_destructive: boolean
  expires: string
  last_used: string
  created: string
}

type CreatedKey = {
  id: string
  key: string
  name: string
}

const EXPIRY_OPTIONS = [
  { value: "never", label: "Never expires", days: 0 },
  { value: "7", label: "7 days", days: 7 },
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
  { value: "365", label: "1 year", days: 365 },
]

function formatDate(value: string) {
  if (!value) return "—"
  return new Date(value).toLocaleDateString()
}

function mcpConfigSnippet(key: string) {
  return JSON.stringify(
    {
      mcpServers: {
        workavera: {
          type: "http",
          url: `${window.location.origin}/api/mcp`,
          headers: { Authorization: `Bearer ${key}` },
        },
      },
    },
    null,
    2
  )
}

async function copyText(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(message)
  } catch {
    toast.error("Could not copy to clipboard")
  }
}

export function ApiKeysCard() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteKey, setDeleteKey] = useState<ApiKeyRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadKeys = useCallback(async () => {
    try {
      const records = await pb
        .collection("api_keys")
        .getFullList<ApiKeyRecord>({ sort: "-created" })
      setKeys(records)
      setError(null)
    } catch {
      setError("Could not load your API keys.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(() => loadKeys())
  }, [loadKeys])

  const handleDelete = async () => {
    if (!deleteKey) return
    setDeleting(true)
    try {
      await pb.collection("api_keys").delete(deleteKey.id)
      setKeys((current) => current.filter((key) => key.id !== deleteKey.id))
      setDeleteKey(null)
      toast.success("API key revoked")
    } catch {
      toast.error("Could not delete the API key")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HugeiconsIcon icon={Key01Icon} strokeWidth={2} className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle>API Keys</CardTitle>
            <CardDescription>
              Connect third-party MCP clients to your Workavera tools. Keys act
              on your behalf.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
            Create key
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="flex flex-col gap-4 px-6 py-6">
            {[0, 1].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-72 max-w-full" />
                </div>
                <Skeleton className="size-8" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={2} />
            </div>
            <p className="text-sm font-medium">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void loadKeys()}>
              Retry
            </Button>
          </div>
        ) : keys.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <HugeiconsIcon
                icon={Key01Icon}
                strokeWidth={2}
                className="size-5"
              />
            </div>
            <p className="text-sm font-medium">No API keys</p>
            <p className="text-xs text-muted-foreground">
              Create a key to connect MCP clients such as Claude Code or
              Cursor.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Name</TableHead>
                <TableHead className="hidden sm:table-cell">Key</TableHead>
                <TableHead className="hidden md:table-cell">Expires</TableHead>
                <TableHead className="hidden md:table-cell">
                  Last used
                </TableHead>
                <TableHead className="pr-6 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="pl-6">
                    <span className="flex items-center gap-2 font-medium">
                      {key.name}
                      {key.allow_destructive && (
                        <Badge
                          variant="outline"
                          className="border-destructive/40 font-normal text-destructive"
                        >
                          Allows deletion
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                    {key.prefix}…
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    {key.expires ? formatDate(key.expires) : "Never"}
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    {formatDate(key.last_used)}
                  </TableCell>
                  <TableCell className="pr-6">
                    <div className="flex items-center justify-end">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleteKey(key)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Delete API key"
                      >
                        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void loadKeys()}
      />

      <AlertDialog
        open={deleteKey !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteKey(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API key?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteKey?.name}” will stop working immediately. Any MCP client
              using it will lose access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault()
                void handleDelete()
              }}
            >
              {deleting ? "Revoking..." : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function CreateKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [name, setName] = useState("")
  const [expiry, setExpiry] = useState("never")
  const [allowDestructive, setAllowDestructive] = useState(false)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<CreatedKey | null>(null)

  const reset = () => {
    setName("")
    setExpiry("never")
    setAllowDestructive(false)
    setCreated(null)
  }

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error("Give the key a name")
      return
    }
    const days = EXPIRY_OPTIONS.find((option) => option.value === expiry)?.days
    setCreating(true)
    try {
      const response = await pb.send<CreatedKey>("/api/apikeys", {
        method: "POST",
        body: {
          name: trimmed,
          allowDestructive,
          expires: days
            ? new Date(Date.now() + days * 86_400_000).toISOString()
            : "",
        },
      })
      setCreated(response)
      onCreated()
    } catch {
      toast.error("Could not create the API key")
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (creating) return
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Save your API key</DialogTitle>
              <DialogDescription>
                This is the only time the full key is shown. Store it somewhere
                safe.
              </DialogDescription>
            </DialogHeader>
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs">
                  {created.key}
                </code>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => void copyText(created.key, "API key copied")}
                  aria-label="Copy API key"
                >
                  <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                </Button>
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label>MCP client configuration</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void copyText(
                        mcpConfigSnippet(created.key),
                        "MCP configuration copied"
                      )
                    }
                  >
                    <HugeiconsIcon
                      icon={Copy01Icon}
                      strokeWidth={2}
                      className="size-4"
                    />
                    Copy
                  </Button>
                </div>
                <pre className="w-full overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs leading-relaxed">
                  {mcpConfigSnippet(created.key)}
                </pre>
                <p className="text-xs text-muted-foreground">
                  Paste this into your MCP client settings, e.g.{" "}
                  <code>.mcp.json</code> for Claude Code or{" "}
                  <code>mcp.json</code> for Cursor.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  onOpenChange(false)
                  reset()
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
              <DialogDescription>
                The key grants MCP clients access to your boards, calendar,
                docs, reading list, and contacts.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="api-key-name">Name</Label>
                <Input
                  id="api-key-name"
                  value={name}
                  maxLength={100}
                  placeholder="e.g. Claude Code on my laptop"
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Expiration</Label>
                <Select value={expiry} onValueChange={setExpiry}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPIRY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
                <Checkbox
                  checked={allowDestructive}
                  onCheckedChange={(checked) =>
                    setAllowDestructive(checked === true)
                  }
                  className="mt-0.5"
                />
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-destructive">
                    Allow destructive operations
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Dangerous: this key can permanently delete tasks and
                    calendar events without any confirmation prompt. Leave off
                    unless you fully trust the client using it.
                  </span>
                </span>
              </label>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={creating}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button disabled={creating} onClick={() => void handleCreate()}>
                {creating ? "Creating..." : "Create key"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
