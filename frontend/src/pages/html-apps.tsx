import { useEffect, useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import { AppWindowIcon, HtmlFile01Icon, Search01Icon } from "@hugeicons/core-free-icons"
import type { RecordModel } from "pocketbase"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
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
        setSelectedId((current) => {
          if (result.items.length === 0) {
            return null
          }
          if (current && result.items.some((app) => app.id === current)) {
            return current
          }
          return result.items[0].id
        })
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(extractErrorMessage(err, "Could not load HTML apps."))
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadApps()
    return () => controller.abort()
  }, [page, query])

  const selectedApp = apps.find((app) => app.id === selectedId) || null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
              <HugeiconsIcon icon={AppWindowIcon} strokeWidth={2} className="size-4" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">HTML Apps</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Browse AI-generated self-contained HTML apps and preview them in place.
          </p>
        </div>
        <div className="relative w-full lg:w-80">
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

      {error ? (
        <Card className="border-destructive/30 bg-destructive/5" size="sm">
          <CardContent className="text-destructive text-sm">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid min-h-[620px] gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="min-h-0" size="sm">
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
            {loading ? (
              <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm">
                <Spinner className="size-4" />
                Loading apps
              </div>
            ) : apps.length === 0 ? (
              <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center text-sm">
                <DefaultThumbnail className="h-28 w-44" />
                <div>
                  <p className="text-foreground font-medium">No HTML apps yet</p>
                  <p className="mt-1">Ask the assistant to create one.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2 overflow-auto pr-1">
                  {apps.map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => setSelectedId(app.id)}
                      className={cn(
                        "hover:bg-muted/70 flex gap-3 rounded-xl border p-2 text-left transition-colors",
                        selectedId === app.id ? "border-primary bg-primary/5" : "border-transparent"
                      )}
                    >
                      <AppThumbnail app={app} />
                      <div className="min-w-0 flex-1 py-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{app.name}</p>
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            {app.status}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                          {app.description || "No description"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t pt-3 text-xs">
                  <span className="text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-[520px]" size="sm">
          {selectedApp ? (
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{selectedApp.name}</p>
                  <p className="text-muted-foreground text-xs">
                    /api/html-apps/{selectedApp.id}/preview
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`/api/html-apps/${selectedApp.id}/preview`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                </Button>
              </div>
              <div className="bg-muted/50 flex flex-1 overflow-hidden rounded-xl border">
                <iframe
                  key={selectedApp.id}
                  title={`${selectedApp.name} preview`}
                  src={`/api/html-apps/${selectedApp.id}/preview`}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  referrerPolicy="no-referrer"
                  className="h-full min-h-[500px] w-full bg-white"
                />
              </div>
            </CardContent>
          ) : (
            <CardContent className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
              Select an app to preview.
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  )
}

function AppThumbnail({ app }: { app: HTMLAppRecord }) {
  if (app.thumbnail) {
    return (
      <img
        src={pb.files.getURL(app, app.thumbnail, { thumb: "320x180" })}
        alt=""
        className="h-16 w-24 shrink-0 rounded-lg object-cover ring-1 ring-foreground/10"
      />
    )
  }
  return <DefaultThumbnail className="h-16 w-24 shrink-0" />
}

function DefaultThumbnail({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-muted/50 flex items-center justify-center rounded-lg border border-dashed border-foreground/15",
        className
      )}
    >
      <div className="bg-background text-muted-foreground flex size-9 items-center justify-center rounded-lg border shadow-xs">
        <HugeiconsIcon icon={HtmlFile01Icon} strokeWidth={2} className="size-5" />
      </div>
    </div>
  )
}
