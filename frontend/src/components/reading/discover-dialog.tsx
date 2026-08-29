import { useEffect, useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Alert02Icon,
  BookOpen01Icon,
  Delete02Icon,
  Edit01Icon,
  RefreshIcon,
  SparklesIcon,
  StarIcon,
} from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatRelativeTime } from "@/lib/chat-utils"
import { cn } from "@/lib/utils"
import { SUMMARY_LANGUAGES } from "@/store/reading"
import {
  TRENDING_SINCE_LABELS,
  useReadingDiscoverStore,
  type DiscoverCandidate,
  type ReadingSource,
  type ReadingSourceInput,
  type TrendingSince,
} from "@/store/reading-discover"

const emptySourceForm: ReadingSourceInput = {
  name: "",
  kind: "rss",
  url: "",
  language: "",
  since: "weekly",
  enabled: true,
}

export function ReadingDiscoverDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [tab, setTab] = useState("candidates")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ReadingSourceInput | null>(null)

  const sources = useReadingDiscoverStore((s) => s.sources)
  const selectedSourceIds = useReadingDiscoverStore((s) => s.selectedSourceIds)
  const candidates = useReadingDiscoverStore((s) => s.candidates)
  const failures = useReadingDiscoverStore((s) => s.failures)
  const summaries = useReadingDiscoverStore((s) => s.summaries)
  const language = useReadingDiscoverStore((s) => s.language)
  const fetching = useReadingDiscoverStore((s) => s.fetching)
  const fetched = useReadingDiscoverStore((s) => s.fetched)
  const savingSource = useReadingDiscoverStore((s) => s.savingSource)
  const summarizingUrl = useReadingDiscoverStore((s) => s.summarizingUrl)
  const savingUrl = useReadingDiscoverStore((s) => s.savingUrl)
  const loadSources = useReadingDiscoverStore((s) => s.loadSources)
  const createSource = useReadingDiscoverStore((s) => s.createSource)
  const updateSource = useReadingDiscoverStore((s) => s.updateSource)
  const setSourceEnabled = useReadingDiscoverStore((s) => s.setSourceEnabled)
  const deleteSource = useReadingDiscoverStore((s) => s.deleteSource)
  const toggleSelectedSource = useReadingDiscoverStore(
    (s) => s.toggleSelectedSource
  )
  const setLanguage = useReadingDiscoverStore((s) => s.setLanguage)
  const discover = useReadingDiscoverStore((s) => s.discover)
  const summarizeCandidate = useReadingDiscoverStore(
    (s) => s.summarizeCandidate
  )
  const saveCandidate = useReadingDiscoverStore((s) => s.saveCandidate)
  const flushSaved = useReadingDiscoverStore((s) => s.flushSaved)

  useEffect(() => {
    if (!open) return
    void Promise.resolve().then(loadSources)
  }, [loadSources, open])

  const enabledSources = sources.filter((source) => source.enabled)

  const closeForm = () => {
    setForm(null)
    setEditingId(null)
  }

  const submitForm = async () => {
    if (!form) return
    if (editingId) await updateSource(editingId, form)
    else await createSource(form)
    closeForm()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          closeForm()
          void flushSaved()
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="flex max-h-[88vh] flex-col sm:max-w-[min(72rem,92vw)]">
        <DialogHeader>
          <DialogTitle>Discover</DialogTitle>
          <DialogDescription>
            Fetch what your subscriptions are showing right now, summarize
            anything worth a closer look, and keep only what you want.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={setTab}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList>
            <TabsTrigger value="candidates">Candidates</TabsTrigger>
            <TabsTrigger value="sources">
              Subscriptions
              <Badge variant="secondary" className="ml-1.5 px-1.5 text-[10px]">
                {sources.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="candidates"
            className="flex min-h-0 flex-1 flex-col gap-3"
          >
            <div className="flex flex-col gap-3 border-b pb-3">
              {enabledSources.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No subscription is enabled yet. Add one under Subscriptions to
                  start fetching.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {enabledSources.map((source) => {
                    const selected = selectedSourceIds.includes(source.id)
                    return (
                      <button
                        key={source.id}
                        type="button"
                        onClick={() => toggleSelectedSource(source.id)}
                        className={cn(
                          "cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors",
                          selected
                            ? "border-primary bg-primary/10 text-foreground"
                            : "text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {source.name}
                      </button>
                    )
                  })}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="h-9 w-40 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUMMARY_LANGUAGES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        Summarize in {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => void discover()}
                  disabled={fetching || selectedSourceIds.length === 0}
                >
                  <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} />
                  {fetching ? "Fetching..." : "Fetch"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {selectedSourceIds.length} of {enabledSources.length} selected
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {failures.map((failure) => (
                <div
                  key={failure.sourceId}
                  className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                >
                  <HugeiconsIcon
                    icon={Alert02Icon}
                    strokeWidth={2}
                    className="mt-0.5 size-3.5 shrink-0"
                  />
                  <span>
                    <span className="font-medium">{failure.sourceName}</span>:{" "}
                    {failure.message}
                  </span>
                </div>
              ))}

              {fetching ? (
                <div className="columns-1 gap-2 lg:columns-2">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={index}
                      className="mb-2 flex break-inside-avoid flex-col gap-2 rounded-lg border p-3"
                    >
                      <div className="h-3.5 w-1/3 animate-pulse rounded bg-muted" />
                      <div className="h-2.5 w-full animate-pulse rounded bg-muted" />
                    </div>
                  ))}
                </div>
              ) : candidates.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
                  <HugeiconsIcon
                    icon={BookOpen01Icon}
                    strokeWidth={2}
                    className="size-8 opacity-40"
                  />
                  <p>
                    {fetched
                      ? "Nothing came back from the selected subscriptions."
                      : "Pick your subscriptions and fetch to see what is out there."}
                  </p>
                </div>
              ) : (
                // Masonry, so a card that grew a summary does not strand the
                // one beside it. Cards then read down each column rather than
                // across, which the star ranking survives well enough.
                <div className="columns-1 gap-2 lg:columns-2">
                  {candidates.map((candidate) => (
                    <div
                      key={candidate.url}
                      className="mb-2 break-inside-avoid"
                    >
                      <CandidateCard
                        candidate={candidate}
                        summary={summaries[candidate.url]}
                        language={language}
                        summarizing={summarizingUrl === candidate.url}
                        saving={savingUrl === candidate.url}
                        onSummarize={() => void summarizeCandidate(candidate)}
                        onSave={() => void saveCandidate(candidate)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent
            value="sources"
            className="flex min-h-0 flex-1 flex-col gap-3"
          >
            {form ? (
              <SourceForm
                form={form}
                setForm={setForm}
                editing={editingId !== null}
                saving={savingSource}
                onCancel={closeForm}
                onSubmit={() => void submitForm()}
              />
            ) : (
              <Button
                variant="outline"
                className="self-start"
                onClick={() => {
                  setEditingId(null)
                  setForm(emptySourceForm)
                }}
              >
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                Add subscription
              </Button>
            )}

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {sources.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No subscriptions yet.
                </p>
              ) : (
                sources.map((source) => (
                  <SourceRow
                    key={source.id}
                    source={source}
                    onToggle={(enabled) =>
                      void setSourceEnabled(source.id, enabled)
                    }
                    onEdit={() => {
                      setEditingId(source.id)
                      setForm({
                        name: source.name,
                        kind: source.kind,
                        url: source.url,
                        language: source.language,
                        since: source.since,
                        enabled: source.enabled,
                      })
                    }}
                    onDelete={() => void deleteSource(source.id)}
                  />
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function CandidateCard({
  candidate,
  summary,
  language,
  summarizing,
  saving,
  onSummarize,
  onSave,
}: {
  candidate: DiscoverCandidate
  summary?: { summary: string; keyPoints: string[]; language: string }
  language: string
  summarizing: boolean
  saving: boolean
  onSummarize: () => void
  onSave: () => void
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <a
          href={candidate.url}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 text-sm font-medium hover:underline"
        >
          {candidate.title}
        </a>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {candidate.periodStars ? (
            <Badge variant="secondary" className="cursor-default gap-1">
              <HugeiconsIcon
                icon={StarIcon}
                strokeWidth={2}
                className="size-3"
              />
              +{candidate.periodStars.toLocaleString()}{" "}
              {TRENDING_SINCE_LABELS[candidate.starsPeriod ?? "weekly"]}
            </Badge>
          ) : null}
          {candidate.language ? (
            <Badge variant="outline" className="cursor-default">
              {candidate.language}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{candidate.sourceName}</span>
        {candidate.stars ? (
          <span>{candidate.stars.toLocaleString()} stars</span>
        ) : null}
        {candidate.publishedAt ? (
          <span>{formatRelativeTime(candidate.publishedAt)}</span>
        ) : null}
      </div>

      {candidate.description && (
        <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
          {candidate.description}
        </p>
      )}

      {/* A summary is capped and scrolls on its own, so one long result cannot
          stretch its whole row and strand the card beside it. */}
      {summary && (
        <div className="max-h-56 overflow-y-auto rounded-md bg-muted/60 p-2.5 text-xs leading-relaxed">
          <p>{summary.summary}</p>
          {summary.keyPoints.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
              {summary.keyPoints.map((point, index) => (
                <li key={index}>{point}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 pt-1">
        <Button
          variant="secondary"
          size="sm"
          onClick={onSummarize}
          disabled={summarizing}
        >
          <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} />
          {summarizing
            ? "Summarizing..."
            : summary
              ? "Summarize again"
              : `Summarize in ${language}`}
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving || candidate.alreadySaved}
        >
          {candidate.alreadySaved
            ? "In reading list"
            : saving
              ? "Adding..."
              : "Add to reading"}
        </Button>
      </div>
    </div>
  )
}

function SourceRow({
  source,
  onToggle,
  onEdit,
  onDelete,
}: {
  source: ReadingSource
  onToggle: (enabled: boolean) => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{source.name}</span>
          <Badge variant="outline" className="cursor-default text-[10px]">
            {source.kind === "rss" ? "RSS" : "GitHub trending"}
          </Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {source.kind === "rss"
            ? source.url
            : `${source.language} · ${TRENDING_SINCE_LABELS[source.since]}`}
        </p>
        {source.lastError ? (
          <p className="truncate text-xs text-destructive">
            {source.lastError}
          </p>
        ) : source.lastFetchedAt ? (
          <p className="text-xs text-muted-foreground">
            Fetched {formatRelativeTime(source.lastFetchedAt)}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Switch checked={source.enabled} onCheckedChange={onToggle} />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          aria-label="Edit subscription"
        >
          <HugeiconsIcon icon={Edit01Icon} strokeWidth={2} className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label="Remove subscription"
        >
          <HugeiconsIcon
            icon={Delete02Icon}
            strokeWidth={2}
            className="size-4 text-destructive"
          />
        </Button>
      </div>
    </div>
  )
}

function SourceForm({
  form,
  setForm,
  editing,
  saving,
  onCancel,
  onSubmit,
}: {
  form: ReadingSourceInput
  setForm: (form: ReadingSourceInput) => void
  editing: boolean
  saving: boolean
  onCancel: () => void
  onSubmit: () => void
}) {
  const incomplete =
    !form.name.trim() ||
    (form.kind === "rss" ? !form.url.trim() : !form.language.trim())

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="source-name">Name</Label>
          <Input
            id="source-name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="GitHub Trending · Go"
          />
        </div>
        <div className="grid gap-2">
          <Label>Kind</Label>
          <Select
            value={form.kind}
            onValueChange={(kind) =>
              setForm({ ...form, kind: kind as ReadingSourceInput["kind"] })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rss">RSS or Atom feed</SelectItem>
              <SelectItem value="github_trending">GitHub trending</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {form.kind === "rss" ? (
        <div className="grid gap-2">
          <Label htmlFor="source-url">Feed URL</Label>
          <Input
            id="source-url"
            value={form.url}
            onChange={(event) => setForm({ ...form, url: event.target.value })}
            placeholder="https://example.com/feed.xml"
          />
          <p className="text-xs text-muted-foreground">
            A repository's releases feed works here too:
            https://github.com/owner/repo/releases.atom
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="source-language">Language</Label>
            <Input
              id="source-language"
              value={form.language}
              onChange={(event) =>
                setForm({ ...form, language: event.target.value })
              }
              placeholder="go, rust, typescript"
            />
          </div>
          <div className="grid gap-2">
            <Label>Period</Label>
            <Select
              value={form.since}
              onValueChange={(since) =>
                setForm({ ...form, since: since as TrendingSince })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Stars gained today</SelectItem>
                <SelectItem value="weekly">Stars gained this week</SelectItem>
                <SelectItem value="monthly">Stars gained this month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch
            checked={form.enabled}
            onCheckedChange={(enabled) => setForm({ ...form, enabled })}
          />
          Enabled
        </label>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={saving || incomplete}>
            {saving ? "Saving..." : editing ? "Save" : "Add"}
          </Button>
        </div>
      </div>
    </div>
  )
}
