import { useEffect, useState } from "react"
import { useSearchParams } from "react-router"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  AppWindowIcon,
  ArrowUpRightIcon,
  HtmlFile01Icon,
  Search02Icon,
} from "@hugeicons/core-free-icons"
import type { RecordModel } from "pocketbase"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { cn } from "@/lib/utils"
import { extractErrorMessage } from "@/lib/error"
import { pb } from "@/lib/pocketbase"

const PAGE_SIZE = 8

type AIMicroAppRecord = RecordModel & {
  name: string
  description: string
  html_file: string
  thumbnail: string
  status: "draft" | "published" | "archived"
  updated: string
}

export function AIMicroAppsPage() {
  const [searchParams] = useSearchParams()
  const [apps, setApps] = useState<AIMicroAppRecord[]>([])
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
        const result = await pb.collection("ai_micro_apps").getList<AIMicroAppRecord>(page, PAGE_SIZE, {
          sort: "-updated",
          filter,
          requestKey: null,
          signal: controller.signal,
        })
        setApps(result.items)
        setTotalPages(result.totalPages || 1)
        setTotalItems(result.totalItems)
        setSelectedId((current) => {
          const requestedId = searchParams.get("app")
          if (result.items.length === 0) return null
          if (requestedId && result.items.some((app) => app.id === requestedId)) return requestedId
          if (current && result.items.some((app) => app.id === current)) return current
          return result.items[0].id
        })
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(extractErrorMessage(err, "Could not load AI micro apps."))
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadApps()
    return () => controller.abort()
  }, [page, query, searchParams])

  const selectedApp = apps.find((app) => app.id === selectedId) || null

  return (
    <div className="-m-4 flex h-[calc(100vh-4rem)] overflow-hidden md:-m-6">
      <div className="flex h-full w-72 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex flex-col gap-2 border-b p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">AI Micro Apps</span>
            {!loading && totalItems > 0 ? (
              <span className="text-xs text-muted-foreground">{totalItems}</span>
            ) : null}
          </div>
          <div className="relative">
            <HugeiconsIcon
              icon={Search02Icon}
              strokeWidth={2}
              className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
              placeholder="Search micro apps..."
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        {error ? (
          <div className="border-destructive/30 bg-destructive/5 text-destructive m-2 rounded-lg border px-3 py-2 text-sm">
            {error}
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <ListSkeleton />
          ) : apps.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col gap-1">
                {apps.map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => setSelectedId(app.id)}
                    className={cn(
                      "flex w-full cursor-pointer flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-colors",
                      selectedId === app.id ? "bg-muted" : "hover:bg-muted/60"
                    )}
                  >
                    <span className="line-clamp-1 text-sm font-medium text-foreground/90">
                      {app.name}
                    </span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {app.description || "No description"}
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>

        {!loading && totalPages > 0 ? (
          <Pagination className="justify-end px-2 py-1">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  text="Prev"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className={
                    page <= 1 || loading ? "pointer-events-none opacity-50" : "cursor-pointer"
                  }
                />
              </PaginationItem>
              <span className="flex items-center px-2 text-xs text-muted-foreground">
                {page} / {Math.max(1, totalPages)}
              </span>
              <PaginationItem>
                <PaginationNext
                  text="Next"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  className={
                    page >= totalPages || loading
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col bg-background">
          {selectedApp ? (
            <>
              <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{selectedApp.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {selectedApp.description || "Self-contained micro app"}
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" asChild>
                  <a
                    href={`/api/ai-micro-apps/${selectedApp.id}/preview`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open in new tab"
                  >
                    <HugeiconsIcon icon={ArrowUpRightIcon} strokeWidth={2} className="size-4" />
                  </a>
                </Button>
              </div>

              <div className="relative flex-1 overflow-hidden">
                <iframe
                  key={selectedApp.id}
                  title={`${selectedApp.name} preview`}
                  src={`/api/ai-micro-apps/${selectedApp.id}/preview`}
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
        <p className="text-foreground font-medium">No AI micro apps yet</p>
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
