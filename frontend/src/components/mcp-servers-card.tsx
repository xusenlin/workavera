import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  AlertCircleIcon,
  CloudServerIcon,
  Delete02Icon,
  Edit01Icon,
  RefreshIcon,
  Settings02Icon,
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { pb } from "@/lib/pocketbase"
import { cn } from "@/lib/utils"

type McpTool = {
  name: string
  description: string
  enabled: boolean
  approval: "always" | "never"
  hash: string
  stale: boolean
}

type McpServer = {
  id: string
  name: string
  slug: string
  transport: "http" | "sse"
  url: string
  approvalPolicy: "all" | "writes" | "none"
  enabled: boolean
  tools: McpTool[]
  headerNames: string[]
  lastError: string
  lastRefreshed: string
}

type RefreshReport = {
  added: string[]
  changed: string[]
  removed: string[]
  unchanged: string[]
  unsupported: string[]
}

type RefreshResponse = {
  ok: boolean
  error?: string
  report?: RefreshReport
  server: McpServer
}

const POLICY_OPTIONS = [
  {
    value: "writes",
    label: "Ask unless the server says read-only",
    // Most MCP servers publish no readOnlyHint at all, in which case this
    // behaves the same as "Ask for everything".
    hint: "Trusts the server's own read-only hint. Many servers publish no hint, so their tools will still ask.",
  },
  {
    value: "all",
    label: "Ask for everything",
    hint: "Every tool from this server asks before running, whatever the server claims about itself.",
  },
  {
    value: "none",
    label: "Never ask",
    hint: "Tools run without confirmation. Only for servers you fully trust.",
  },
]

function parseHeaders(raw: string): Record<string, string> | null {
  const headers: Record<string, string> = {}
  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const separator = trimmed.indexOf(":")
    if (separator <= 0) return null
    headers[trimmed.slice(0, separator).trim()] = trimmed
      .slice(separator + 1)
      .trim()
  }
  return headers
}

// enabledToolCount is what decides whether a server does anything at all: the
// backend only contributes a tool when both the server and the tool are
// enabled, so a server with nothing selected is inert however its own switch
// is set.
function enabledToolCount(server: McpServer) {
  return server.tools.filter((tool) => tool.enabled).length
}

function serverStatus(server: McpServer) {
  if (server.lastError) {
    // A credential or reachability problem needs different action from a
    // changed tool, so it is never described as one.
    return { tone: "destructive" as const, label: "Connection problem" }
  }
  if (server.tools.some((tool) => tool.stale)) {
    return { tone: "warning" as const, label: "May need a refresh" }
  }
  if (server.tools.length === 0) {
    return { tone: "muted" as const, label: "No tools loaded" }
  }
  // Checked before the server's own switch: "select some tools" is the useful
  // next step, whereas "Disabled" would leave the user flipping a switch that
  // cannot change anything.
  if (enabledToolCount(server) === 0) {
    return { tone: "muted" as const, label: "No tools selected" }
  }
  if (!server.enabled) {
    return { tone: "muted" as const, label: "Disabled" }
  }
  return {
    tone: "success" as const,
    label: `${enabledToolCount(server)} tools enabled`,
  }
}

export function McpServersCard() {
  const [servers, setServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editServer, setEditServer] = useState<McpServer | null>(null)
  const [reviewServer, setReviewServer] = useState<McpServer | null>(null)
  const [deleteServer, setDeleteServer] = useState<McpServer | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadServers = useCallback(async () => {
    try {
      const records = await pb
        .collection("mcp_servers")
        .getFullList<Record<string, unknown>>({ sort: "created" })
      setServers(
        records.map((record) => ({
          id: String(record.id),
          name: String(record.name ?? ""),
          slug: String(record.slug ?? ""),
          transport: (record.transport as McpServer["transport"]) ?? "http",
          url: String(record.url ?? ""),
          approvalPolicy:
            (record.approval_policy as McpServer["approvalPolicy"]) ?? "writes",
          enabled: Boolean(record.enabled),
          tools: Array.isArray(record.tools) ? (record.tools as McpTool[]) : [],
          headerNames: [],
          lastError: String(record.last_error ?? ""),
          lastRefreshed: String(record.last_refreshed ?? ""),
        }))
      )
      setError(null)
    } catch {
      setError("Could not load your MCP servers.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(() => loadServers())
  }, [loadServers])

  const patchServer = async (
    server: McpServer,
    body: Record<string, unknown>
  ) => {
    try {
      await pb.send(`/api/mcp-servers/${server.id}`, { method: "PATCH", body })
      await loadServers()
    } catch {
      toast.error("Could not update the server")
    }
  }

  const handleDelete = async () => {
    if (!deleteServer) return
    setDeleting(true)
    try {
      await pb.collection("mcp_servers").delete(deleteServer.id)
      setServers((current) =>
        current.filter((server) => server.id !== deleteServer.id)
      )
      setDeleteServer(null)
      toast.success("MCP server removed")
    } catch {
      toast.error("Could not remove the server")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HugeiconsIcon
              icon={CloudServerIcon}
              strokeWidth={2}
              className="size-4"
            />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle>MCP Servers</CardTitle>
            <CardDescription>
              Connect your own MCP servers so Chat can use their tools. Servers
              and their credentials are private to your account.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <HugeiconsIcon
              icon={Add01Icon}
              strokeWidth={2}
              className="size-4"
            />
            Add server
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadServers()}
            >
              Retry
            </Button>
          </div>
        ) : servers.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <HugeiconsIcon
                icon={CloudServerIcon}
                strokeWidth={2}
                className="size-5"
              />
            </div>
            <p className="text-sm font-medium">No MCP servers</p>
            <p className="text-xs text-muted-foreground">
              Add a server, refresh it, then choose which of its tools Chat may
              use.
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y">
            {servers.map((server) => {
              const status = serverStatus(server)
              return (
                <div
                  key={server.id}
                  className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{server.name}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-normal",
                          status.tone === "destructive" &&
                            "border-destructive/40 text-destructive",
                          status.tone === "warning" &&
                            "border-amber-500/40 text-amber-600 dark:text-amber-500",
                          status.tone === "muted" && "text-muted-foreground"
                        )}
                      >
                        {status.label}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {server.url}
                    </p>
                    {server.lastError && (
                      <p className="mt-1 text-xs text-destructive">
                        {server.lastError}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Switch
                      checked={server.enabled && enabledToolCount(server) > 0}
                      // Enabling means "offer this server's tools to Chat", so
                      // it stays inoperable until at least one tool is
                      // selected. A failed connection is not auto-disabled
                      // though: that would overwrite the user's choice over
                      // what may be a temporary outage.
                      disabled={enabledToolCount(server) === 0}
                      title={
                        enabledToolCount(server) === 0
                          ? "Select at least one tool before enabling this server"
                          : undefined
                      }
                      onCheckedChange={(checked) =>
                        void patchServer(server, { enabled: checked })
                      }
                      aria-label="Enable server"
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setReviewServer(server)}
                      aria-label="Manage tools"
                    >
                      <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setEditServer(server)}
                      aria-label="Edit server"
                    >
                      <HugeiconsIcon icon={Edit01Icon} strokeWidth={2} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleteServer(server)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove server"
                    >
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      {createOpen && (
        <ServerSheet
          onOpenChange={(open) => {
            if (!open) setCreateOpen(false)
          }}
          onSaved={() => void loadServers()}
        />
      )}

      {editServer && (
        <ServerSheet
          key={editServer.id}
          server={editServer}
          onOpenChange={(open) => {
            if (!open) setEditServer(null)
          }}
          onSaved={() => void loadServers()}
        />
      )}

      {reviewServer && (
        <ToolReviewSheet
          key={reviewServer.id}
          server={reviewServer}
          onOpenChange={(open) => {
            if (!open) setReviewServer(null)
          }}
          onChanged={() => void loadServers()}
        />
      )}

      <AlertDialog
        open={deleteServer !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteServer(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove MCP server?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteServer?.name}” and its stored credentials will be deleted.
              Chat will stop offering its tools immediately.
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
              {deleting ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

// Mounted with a key by the parent, so opening a different server remounts the
// form with that server's values instead of syncing props into state.
function ServerSheet({
  server,
  onOpenChange,
  onSaved,
}: {
  server?: McpServer
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [name, setName] = useState(server?.name ?? "")
  const [slug, setSlug] = useState(server?.slug ?? "")
  const [url, setUrl] = useState(server?.url ?? "")
  const [transport, setTransport] = useState<string>(
    server?.transport ?? "http"
  )
  const [policy, setPolicy] = useState<string>(
    server?.approvalPolicy ?? "writes"
  )
  const [headers, setHeaders] = useState("")
  const [saving, setSaving] = useState(false)

  const editing = server !== undefined

  const handleSave = async () => {
    const parsed = parseHeaders(headers)
    if (parsed === null) {
      toast.error("Each header must be written as “Name: value”")
      return
    }
    setSaving(true)
    try {
      if (editing) {
        const body: Record<string, unknown> = {
          name: name.trim(),
          transport,
          url: url.trim(),
          approvalPolicy: policy,
        }
        // Credentials are write-only, so an untouched field must leave the
        // stored headers alone rather than replacing them with nothing.
        if (headers.trim()) body.headers = parsed
        await pb.send(`/api/mcp-servers/${server.id}`, {
          method: "PATCH",
          body,
        })
        toast.success("MCP server updated")
      } else {
        await pb.send("/api/mcp-servers", {
          method: "POST",
          body: {
            name: name.trim(),
            slug: slug.trim().toLowerCase(),
            transport,
            url: url.trim(),
            approvalPolicy: policy,
            headers: parsed,
          },
        })
        toast.success("MCP server added. Refresh it to load its tools.")
      }
      onSaved()
      onOpenChange(false)
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String((error as { message: unknown }).message)
          : "Could not save the server"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (saving) return
        onOpenChange(next)
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-lg!">
        <SheetHeader>
          <SheetTitle>
            {editing ? "Edit MCP server" : "Add MCP server"}
          </SheetTitle>
          <SheetDescription>
            {editing
              ? "Changing the endpoint or credentials does not touch the tools you already reviewed. Refresh afterwards if the server now offers something different."
              : "Chat will be able to use the tools you enable after refreshing. Credentials are stored write-only and never shown again."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 overflow-y-auto px-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="mcp-name">Name</Label>
            <Input
              id="mcp-name"
              value={name}
              maxLength={100}
              placeholder="e.g. Notion"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="mcp-slug">Tool prefix</Label>
            <Input
              id="mcp-slug"
              value={slug}
              maxLength={20}
              disabled={editing}
              placeholder="e.g. notion"
              onChange={(event) => setSlug(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Tools appear to the assistant as{" "}
              <code>mcp_{slug || "prefix"}_toolname</code>.{" "}
              {editing
                ? "The prefix is fixed once tools exist, because changing it would rename every tool the assistant knows."
                : "Lowercase letters, digits, and underscores."}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="mcp-url">Endpoint URL</Label>
            <Input
              id="mcp-url"
              value={url}
              placeholder="https://example.com/mcp"
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Transport</Label>
            <Select value={transport} onValueChange={setTransport}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="http">Streamable HTTP</SelectItem>
                <SelectItem value="sse">SSE (legacy)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Approval for newly found tools</Label>
            <Select value={policy} onValueChange={setPolicy}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POLICY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {POLICY_OPTIONS.find((option) => option.value === policy)?.hint}{" "}
              This only pre-selects the setting when a refresh finds a new or
              changed tool. You can change any tool individually afterwards, and
              tools you already reviewed keep their current setting.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="mcp-headers">Request headers</Label>
            <Textarea
              id="mcp-headers"
              value={headers}
              rows={3}
              placeholder={"Authorization: Bearer your-token"}
              onChange={(event) => setHeaders(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              One per line, written as “Name: value”. These are your personal
              credentials for the upstream service.
            </p>
          </div>
        </div>
        <SheetFooter className="flex-row justify-end gap-2">
          <SheetClose asChild>
            <Button variant="ghost" disabled={saving}>
              Cancel
            </Button>
          </SheetClose>
          <Button disabled={saving} onClick={() => void handleSave()}>
            {saving ? "Saving..." : editing ? "Save changes" : "Add server"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// The parent mounts this with a key of the server id, so switching servers
// remounts it with fresh state instead of syncing props into state.
function ToolReviewSheet({
  server,
  onOpenChange,
  onChanged,
}: {
  server: McpServer
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const [tools, setTools] = useState<McpTool[]>(server.tools)
  const [report, setReport] = useState<RefreshReport | null>(null)
  const [refreshError, setRefreshError] = useState(server.lastError)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const response = await pb.send<RefreshResponse>(
        `/api/mcp-servers/${server.id}/refresh`,
        { method: "POST" }
      )
      // A failed refresh still writes last_error to the record, so the list
      // behind this sheet is stale either way and has to be reloaded.
      onChanged()
      if (!response.ok) {
        const message = response.error ?? "Could not reach the server"
        setRefreshError(message)
        toast.error(message)
        return
      }
      setRefreshError("")
      setTools(response.server.tools ?? [])
      setReport(response.report ?? null)
      const changes =
        (response.report?.added.length ?? 0) +
        (response.report?.changed.length ?? 0) +
        (response.report?.removed.length ?? 0)
      toast.success(
        changes === 0
          ? "No changes since the last refresh"
          : "Review the changes, then choose which tools to enable"
      )
    } catch {
      const message = "Could not refresh the server"
      setRefreshError(message)
      toast.error(message)
      onChanged()
    } finally {
      setRefreshing(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await pb.send(`/api/mcp-servers/${server.id}/tools`, {
        method: "PATCH",
        body: {
          tools: tools.map((tool) => ({
            name: tool.name,
            enabled: tool.enabled,
            approval: tool.approval,
          })),
        },
      })
      toast.success("Tool selection saved")
      onChanged()
      onOpenChange(false)
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String((error as { message: unknown }).message)
          : "Could not save the tool selection"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const updateTool = (name: string, patch: Partial<McpTool>) => {
    setTools((current) =>
      current.map((tool) => (tool.name === name ? { ...tool, ...patch } : tool))
    )
  }

  const statusFor = (tool: McpTool) => {
    if (report?.added.includes(tool.name)) return "New"
    if (report?.changed.includes(tool.name)) return "Changed"
    if (tool.stale) return "May be out of date"
    return null
  }

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg!">
        <SheetHeader>
          <SheetTitle>{server.name}</SheetTitle>
          <SheetDescription>
            Only the tools you enable here are offered to Chat. Refreshing never
            enables anything on its own.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-2 border-b px-6 pb-4">
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => void handleRefresh()}
          >
            <HugeiconsIcon
              icon={RefreshIcon}
              strokeWidth={2}
              className="size-4"
            />
            {refreshing ? "Refreshing..." : "Refresh from server"}
          </Button>
          {report && report.removed.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {report.removed.length} removed upstream
            </span>
          )}
        </div>

        {refreshError && (
          <div className="border-b px-6 py-3">
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <HugeiconsIcon
                icon={AlertCircleIcon}
                strokeWidth={2}
                className="mt-0.5 size-4 shrink-0"
              />
              <span>{refreshError}</span>
            </div>
          </div>
        )}

        {report && report.unsupported.length > 0 && (
          <div className="border-b px-6 py-3">
            <p className="text-xs text-muted-foreground">
              Not supported: {report.unsupported.join(", ")}. Their input
              schemas use references Workavera cannot resolve.
            </p>
          </div>
        )}

        <div className="flex flex-col overflow-y-auto px-6">
          {tools.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No tools loaded yet. Refresh to fetch them from the server.
            </p>
          ) : (
            <div className="flex flex-col divide-y">
              {tools.map((tool) => {
                const status = statusFor(tool)
                return (
                  <div key={tool.name} className="flex gap-3 py-3">
                    <Checkbox
                      checked={tool.enabled}
                      onCheckedChange={(checked) =>
                        updateTool(tool.name, { enabled: checked === true })
                      }
                      className="mt-0.5"
                      aria-label={`Enable ${tool.name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm">{tool.name}</span>
                        {status && (
                          <Badge
                            variant="outline"
                            className="border-amber-500/40 font-normal text-amber-600 dark:text-amber-500"
                          >
                            {status}
                          </Badge>
                        )}
                      </div>
                      {tool.description && (
                        <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                          {tool.description}
                        </p>
                      )}
                      {tool.enabled && (
                        <label className="mt-2 flex cursor-pointer items-center gap-2">
                          <Switch
                            checked={tool.approval === "always"}
                            onCheckedChange={(checked) =>
                              updateTool(tool.name, {
                                approval: checked ? "always" : "never",
                              })
                            }
                          />
                          <span className="text-xs text-muted-foreground">
                            Ask before each call
                          </span>
                        </label>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <SheetFooter className="flex-row justify-end gap-2">
          <SheetClose asChild>
            <Button variant="ghost" disabled={saving}>
              Cancel
            </Button>
          </SheetClose>
          <Button
            disabled={saving || tools.length === 0}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving..." : "Save selection"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
