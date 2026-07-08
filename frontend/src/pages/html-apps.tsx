import { useEffect, useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  AppWindowIcon,
  ArrowUpRightIcon,
  HtmlFile01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import type { RecordModel } from "pocketbase"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { extractErrorMessage } from "@/lib/error"
import { pb } from "@/lib/pocketbase"

const PAGE_SIZE = 8

type HTMLAppRecord = RecordModel & {
  name: string
  description: string
  html_file: string
  thumbnail: string
  status: "draft" | "published" | "archived"
  updated: string
}

export function HTMLAppsPage() {
  const [apps, setApps] = useState<HTMLAppRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadApps() {
      setLoading(true)
      setError(null)
      try {
        const trimmed = query.trim().replaceAll('"', '\\"')
        const filter = trimmed
          ? `name ~ "${trimmed}" || description ~ "${trimmed}"`
          : undefined
        const result = await pb.collection("html_apps").getList<HTMLAppRecord>(page, PAGE_SIZE, {
          sort: "-updated",
          filter,
          requestKey: null,
          signal: controller.signal,
        })
        setApps(result.items)
        setTotalPages(result.totalPages || 1)
        setTotalItems(result.totalItems)
        setSelectedId((current) => {
          if (result.items.length === 0) return null
          if (current && result.items.some((app) => app.id === current)) return current
          return result.items[0].id
        })
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(extractErrorMessage(err, "Could not load HTML apps."))
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadApps()
    return () => controller.abort()
  }, [page, query])

  const selectedApp = apps.find((app) => app.id === selectedId) || null

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
              <HugeiconsIcon icon={AppWindowIcon} strokeWidth={2} className="size-4" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">HTML Apps</h1>
            {!loading && totalItems > 0 && (
              <span className="text-muted-foreground text-sm">{totalItems}</span>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            Browse AI-generated self-contained HTML apps and preview them in place.
          </p>
        </div>
        <div className="relative w-full lg:w-72">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            placeholder="Search apps"
            className="pl-9"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Main content */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* List */}
        <div className="flex min-h-0 flex-col">
          {loading ? (
            <ListSkeleton />
          ) : apps.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="flex-1 overflow-y-auto">
                {apps.map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => setSelectedId(app.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                      selectedId === app.id
                        ? "bg-primary/8 border-l-2 border-primary"
                        : "hover:bg-muted/50 border-l-2 border-transparent"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{app.name}</p>
                      <p className="text-muted-foreground mt-0.5 truncate text-xs">
                        {app.description || "No description"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 0 && (
                <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
                  <span className="text-muted-foreground text-xs">
                    {totalItems} app{totalItems === 1 ? "" : "s"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((c) => Math.max(1, c - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-muted-foreground px-1 text-xs tabular-nums">
                      {page}/{totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages || loading}
                      onClick={() => setPage((c) => Math.min(totalPages, c + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Preview */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
          {selectedApp ? (
            <>
              {/* Browser-like address bar */}
              <div className="flex items-center gap-2 border-b px-3 py-2">
                <div className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-red-400/70" />
                  <span className="size-2.5 rounded-full bg-amber-400/70" />
                  <span className="size-2.5 rounded-full bg-green-400/70" />
                </div>
                <div className="bg-muted/60 flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2.5 py-1">
                  <span className="truncate text-xs text-muted-foreground">
                    {selectedApp.name}
                  </span>
                </div>
                <Button variant="ghost" size="icon-sm" asChild>
                  <a
                    href={`/api/html-apps/${selectedApp.id}/preview`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open in new tab"
                  >
                    <HugeiconsIcon icon={ArrowUpRightIcon} strokeWidth={2} className="size-4" />
                  </a>
                </Button>
              </div>

              {/* iframe */}
              <div className="relative flex-1 overflow-hidden">
                <iframe
                  key={selectedApp.id}
                  title={`${selectedApp.name} preview`}
                  src={`/api/html-apps/${selectedApp.id}/preview`}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  referrerPolicy="no-referrer"
                  className="h-full w-full bg-white"
                />
              </div>
            </>
          ) : (
            <PreviewEmptyState />
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ListSkeleton() {
  return (
    <div className="flex-1 space-y-1 p-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg px-3 py-2.5">
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-2.5 w-full animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm">
      <HugeiconsIcon icon={AppWindowIcon} strokeWidth={2} className="size-8 opacity-40" />
      <div>
        <p className="text-foreground font-medium">No HTML apps yet</p>
        <p className="mt-1 text-xs">Ask the assistant to create one.</p>
      </div>
    </div>
  )
}

function PreviewEmptyState() {
  return (
    <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm">
      <HugeiconsIcon icon={HtmlFile01Icon} strokeWidth={2} className="size-8 opacity-40" />
      <p className="text-xs">Select an app to preview</p>
    </div>
  )
}
