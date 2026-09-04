import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useSearchParams } from "react-router"
import { formatDistanceToNow, isSameYear, parseISO } from "date-fns"

import { HugeiconsIcon } from "@hugeicons/react"
import { RefreshIcon } from "@hugeicons/core-free-icons"

import { ProjectTimeline } from "@/components/board/public/project-timeline"
import { PublicTaskDialog } from "@/components/board/public/public-task-dialog"
import { TimelineDays } from "@/components/board/public/timeline-days"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  dateFnsLocale,
  formatDate,
  resolveDateLocale,
  type DateLocale,
} from "@/lib/date-format"
import { pb } from "@/lib/pocketbase"
import {
  publicAvatarURL,
  type PublicPreview,
  type PublicTask,
} from "@/lib/public-board"
import { timelineRange } from "@/lib/timeline"
import { cn } from "@/lib/utils"

type LoadState =
  | { status: "loading" }
  | { status: "ready"; preview: PublicPreview; loadedAt: number }
  | { status: "unavailable" }

// A refresh reloads the whole preview, so clicks in quick succession would only
// repeat the same request.
const REFRESH_THROTTLE_MS = 1000

/**
 * The only Board page an anonymous visitor can reach. It renders one project as
 * it stands right now — resolved from an unguessable slug, never touching the
 * auth store, and refreshed only when the visitor asks for it.
 */
export function PublicBoardPage() {
  const { slug = "" } = useParams()
  const [searchParams] = useSearchParams()
  const locale = resolveDateLocale(searchParams.get("lang"))
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<PublicTask | null>(null)
  const lastLoad = useRef(0)
  const headerRef = useRef<HTMLElement>(null)

  const fetchPreview = useCallback(
    () =>
      pb.send<PublicPreview>(`/api/public/board/${encodeURIComponent(slug)}`, {
        requestKey: null,
      }),
    [slug]
  )

  useEffect(() => {
    let active = true
    lastLoad.current = Date.now()
    void fetchPreview()
      .then((preview) => {
        if (active) setState({ status: "ready", preview, loadedAt: Date.now() })
      })
      .catch(() => {
        if (active) setState({ status: "unavailable" })
      })
    return () => {
      active = false
    }
  }, [fetchPreview])

  const preview = state.status === "ready" ? state.preview : null
  const loadedAt = state.status === "ready" ? state.loadedAt : 0

  useEffect(() => {
    if (preview) window.document.title = preview.project.name
  }, [preview])

  // The day headers stick below the page header, whose height depends on the
  // project's own text, so it publishes that height instead of assuming one.
  useEffect(() => {
    const element = headerRef.current
    if (!element) return
    const root = window.document.documentElement
    const publish = () =>
      root.style.setProperty(
        "--public-header-height",
        `${element.offsetHeight}px`
      )
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(element)
    // A viewport change does not always reach the observer, so the window
    // event backs it up and the header height never goes stale.
    window.addEventListener("resize", publish)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", publish)
      root.style.removeProperty("--public-header-height")
    }
  }, [preview])

  const handleRefresh = () => {
    if (refreshing || Date.now() - lastLoad.current < REFRESH_THROTTLE_MS) return
    lastLoad.current = Date.now()
    setRefreshing(true)
    void fetchPreview()
      .then((next) =>
        setState({ status: "ready", preview: next, loadedAt: Date.now() })
      )
      // A failed refresh means the link stopped working, which reads the same
      // as a link that never worked.
      .catch(() => setState({ status: "unavailable" }))
      .finally(() => setRefreshing(false))
  }

  if (state.status === "unavailable") {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-lg font-medium">This link is not available</p>
        <p className="text-sm text-muted-foreground">
          It may have expired, been revoked, or never existed.
        </p>
      </div>
    )
  }

  if (!preview) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <ProjectOverview
        ref={headerRef}
        preview={preview}
        loadedAt={loadedAt}
        locale={locale}
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />
      <ProjectMembers preview={preview} slug={slug} />
      <ProjectBody preview={preview} locale={locale} onSelect={setSelected} />

      <PublicTaskDialog
        task={selected}
        state={preview.states.find((item) => item.id === selected?.stateId)}
        locale={locale}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      />
    </div>
  )
}

function formatSpan(start: string, end: string, locale: DateLocale) {
  const from = parseISO(start)
  const to = parseISO(end)
  const sameYear = isSameYear(from, to) && isSameYear(from, new Date())
  const pattern = sameYear ? "monthDay" : "monthDayYear"
  if (start === end) return formatDate(from, pattern, locale)
  return `${formatDate(from, pattern, locale)} – ${formatDate(to, pattern, locale)}`
}

function ProjectOverview({
  ref,
  preview,
  loadedAt,
  locale,
  refreshing,
  onRefresh,
}: {
  ref: React.Ref<HTMLElement>
  preview: PublicPreview
  loadedAt: number
  locale: DateLocale
  refreshing: boolean
  onRefresh: () => void
}) {
  const { project, states } = preview
  const span =
    project.start && project.end
      ? formatSpan(project.start, project.end, locale)
      : ""
  const progress = project.taskCount
    ? Math.round((project.completedCount / project.taskCount) * 100)
    : 0

  return (
    // A fragment rather than a wrapper: a sticky element only travels as far as
    // its own parent, so the header has to be a direct child of the page column
    // to stay in view for the whole timeline.
    <>
      {/* Everything above the progress bar stays in view while the timeline
          scrolls, so a visitor never loses which project they are reading. */}
      <header
        ref={ref}
        className="sticky top-0 z-30 -mx-4 -mb-2 flex flex-col gap-4 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">
              {project.name}
            </h1>
            {project.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {project.description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {/* The label belongs to the timestamp it introduces, so it
                  follows the same locale rather than reading half-translated. */}
              {locale === "zh" ? "更新于 " : "Updated "}
              {formatDistanceToNow(loadedAt, {
                addSuffix: true,
                locale: dateFnsLocale(locale),
              })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Refresh"
              title="Refresh"
              onClick={onRefresh}
              disabled={refreshing}
            >
              <HugeiconsIcon
                icon={RefreshIcon}
                strokeWidth={2}
                className={cn(refreshing && "animate-spin")}
              />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
          {span && <span className="font-medium">{span}</span>}
          <span className="text-muted-foreground">
            {project.taskCount} task{project.taskCount === 1 ? "" : "s"}
          </span>
          {states.map((state) => (
            <span
              key={state.id}
              className="inline-flex items-center gap-1.5 text-muted-foreground"
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: state.color }}
              />
              {state.name}
              <span className="font-medium text-foreground">
                {state.taskCount}
              </span>
            </span>
          ))}
        </div>
      </header>

      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground">{progress}% done</span>
      </div>
    </>
  )
}

function ProjectMembers({
  preview,
  slug,
}: {
  preview: PublicPreview
  slug: string
}) {
  if (preview.members.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-4">
      {preview.members.map((member, index) => (
        <div key={`${member.name}-${index}`} className="flex items-center gap-2">
          <Avatar size="sm">
            {member.avatar && (
              <AvatarImage
                src={publicAvatarURL(slug, member.avatar)}
                alt={member.name}
                className="object-cover"
              />
            )}
            <AvatarFallback className="text-[10px]">
              {member.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm">{member.name}</span>
          {member.owner && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              Owner
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function ProjectBody({
  preview,
  locale,
  onSelect,
}: {
  preview: PublicPreview
  locale: DateLocale
  onSelect: (task: PublicTask) => void
}) {
  const range = useMemo(() => timelineRange(preview.tasks), [preview.tasks])

  if (preview.tasks.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        This project has no tasks yet.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {range && (
        // The axis and bars live in one horizontally scrolling grid that
        // lands on today, so narrow screens read the span layer by swiping
        // it, the same way they read the day-by-day layer below.
        <div>
          <ProjectTimeline
            range={range}
            states={preview.states}
            tasks={preview.tasks}
            locale={locale}
            onSelect={onSelect}
          />
        </div>
      )}
      {range ? (
        <TimelineDays
          range={range}
          states={preview.states}
          tasks={preview.tasks}
          locale={locale}
          onSelect={onSelect}
        />
      ) : (
        <TimelineDaysFallback
          preview={preview}
          locale={locale}
          onSelect={onSelect}
        />
      )}
    </div>
  )
}

/** Every task is unscheduled, so there is no timeline to draw around them. */
function TimelineDaysFallback({
  preview,
  locale,
  onSelect,
}: {
  preview: PublicPreview
  locale: DateLocale
  onSelect: (task: PublicTask) => void
}) {
  const today = new Date()
  return (
    <TimelineDays
      range={{ start: today, end: today }}
      states={preview.states}
      tasks={preview.tasks}
      locale={locale}
      onSelect={onSelect}
    />
  )
}
