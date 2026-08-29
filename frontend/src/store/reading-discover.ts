import { type RecordModel } from "pocketbase"
import { toast } from "sonner"
import { create } from "zustand"

import { pb } from "@/lib/pocketbase"
import { readingErrorMessage, useReadingStore } from "@/store/reading"

export type ReadingSourceKind = "rss" | "github_trending"
export type TrendingSince = "daily" | "weekly" | "monthly"

export type ReadingSourceRecord = RecordModel & {
  owner: string
  name: string
  kind: ReadingSourceKind
  url?: string
  params?: unknown
  enabled: boolean
  last_fetched_at?: string
  last_error?: string
}

export type ReadingSource = {
  id: string
  name: string
  kind: ReadingSourceKind
  url: string
  language: string
  since: TrendingSince
  enabled: boolean
  lastFetchedAt?: string
  lastError?: string
}

export type ReadingSourceInput = {
  name: string
  kind: ReadingSourceKind
  url: string
  language: string
  since: TrendingSince
  enabled: boolean
}

export type DiscoverCandidate = {
  sourceId: string
  sourceName: string
  title: string
  url: string
  description?: string
  publishedAt?: string
  language?: string
  stars?: number
  periodStars?: number
  starsPeriod?: TrendingSince
  alreadySaved: boolean
}

export type DiscoverFailure = {
  sourceId: string
  sourceName: string
  message: string
}

export type CandidateSummary = {
  summary: string
  keyPoints: string[]
  language: string
}

const LANGUAGE_STORAGE_KEY = "workavera.reading.discover.language"

function storedLanguage() {
  if (typeof window === "undefined") return "English"
  return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) || "English"
}

function toSource(record: ReadingSourceRecord): ReadingSource {
  const params =
    record.params && typeof record.params === "object"
      ? (record.params as { language?: unknown; since?: unknown })
      : {}
  const since = params.since
  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    url: record.url || "",
    language: typeof params.language === "string" ? params.language : "",
    since:
      since === "daily" || since === "weekly" || since === "monthly"
        ? since
        : "weekly",
    enabled: record.enabled ?? false,
    lastFetchedAt: record.last_fetched_at || undefined,
    lastError: record.last_error || undefined,
  }
}

function toSourceRecord(input: ReadingSourceInput) {
  return {
    name: input.name.trim(),
    kind: input.kind,
    url: input.kind === "rss" ? input.url.trim() : "",
    params:
      input.kind === "github_trending"
        ? { language: input.language.trim().toLowerCase(), since: input.since }
        : {},
    enabled: input.enabled,
  }
}

type ReadingDiscoverState = {
  sources: ReadingSource[]
  selectedSourceIds: string[]
  candidates: DiscoverCandidate[]
  failures: DiscoverFailure[]
  summaries: Record<string, CandidateSummary>
  language: string
  loadingSources: boolean
  fetching: boolean
  fetched: boolean
  savingSource: boolean
  summarizingUrl: string | null
  savingUrl: string | null
  savedCount: number
  loadSources: () => Promise<void>
  createSource: (input: ReadingSourceInput) => Promise<void>
  updateSource: (id: string, input: ReadingSourceInput) => Promise<void>
  setSourceEnabled: (id: string, enabled: boolean) => Promise<void>
  deleteSource: (id: string) => Promise<void>
  toggleSelectedSource: (id: string) => void
  setLanguage: (language: string) => void
  discover: () => Promise<void>
  summarizeCandidate: (candidate: DiscoverCandidate) => Promise<void>
  saveCandidate: (candidate: DiscoverCandidate) => Promise<void>
  flushSaved: () => Promise<void>
}

export const useReadingDiscoverStore = create<ReadingDiscoverState>(
  (set, get) => ({
    sources: [],
    selectedSourceIds: [],
    candidates: [],
    failures: [],
    summaries: {},
    language: storedLanguage(),
    loadingSources: false,
    fetching: false,
    fetched: false,
    savingSource: false,
    summarizingUrl: null,
    savingUrl: null,
    savedCount: 0,

    loadSources: async () => {
      set({ loadingSources: true })
      try {
        const records = await pb
          .collection("reading_sources")
          .getFullList<ReadingSourceRecord>({
            sort: "name",
            requestKey: null,
          })
        const sources = records.map(toSource)
        const enabledIds = sources.filter((s) => s.enabled).map((s) => s.id)
        // Selecting everything enabled is the default the panel promises;
        // a narrower choice the user already made is kept, minus whatever
        // has since been removed or disabled.
        const previous = get().selectedSourceIds.filter((id) =>
          enabledIds.includes(id)
        )
        set({
          sources,
          selectedSourceIds: previous.length > 0 ? previous : enabledIds,
        })
      } catch (error) {
        toast.error(readingErrorMessage(error, "Could not load subscriptions"))
      } finally {
        set({ loadingSources: false })
      }
    },

    createSource: async (input) => {
      const ownerId = pb.authStore.record?.id
      if (!ownerId) throw new Error("You must be signed in to add a source")
      set({ savingSource: true })
      try {
        await pb
          .collection("reading_sources")
          .create({ owner: ownerId, ...toSourceRecord(input) })
        await get().loadSources()
        toast.success("Subscription added")
      } catch (error) {
        const message = readingErrorMessage(
          error,
          "Could not add the subscription"
        )
        toast.error(message)
        throw new Error(message, { cause: error })
      } finally {
        set({ savingSource: false })
      }
    },

    updateSource: async (id, input) => {
      set({ savingSource: true })
      try {
        await pb.collection("reading_sources").update(id, toSourceRecord(input))
        await get().loadSources()
        toast.success("Subscription updated")
      } catch (error) {
        const message = readingErrorMessage(
          error,
          "Could not update the subscription"
        )
        toast.error(message)
        throw new Error(message, { cause: error })
      } finally {
        set({ savingSource: false })
      }
    },

    setSourceEnabled: async (id, enabled) => {
      try {
        await pb.collection("reading_sources").update(id, { enabled })
        await get().loadSources()
      } catch (error) {
        toast.error(
          readingErrorMessage(error, "Could not update the subscription")
        )
      }
    },

    deleteSource: async (id) => {
      try {
        await pb.collection("reading_sources").delete(id)
        set((state) => ({
          selectedSourceIds: state.selectedSourceIds.filter(
            (sourceId) => sourceId !== id
          ),
          candidates: state.candidates.filter(
            (candidate) => candidate.sourceId !== id
          ),
        }))
        await get().loadSources()
        toast.success("Subscription removed")
      } catch (error) {
        toast.error(
          readingErrorMessage(error, "Could not remove the subscription")
        )
      }
    },

    toggleSelectedSource: (id) =>
      set((state) => ({
        selectedSourceIds: state.selectedSourceIds.includes(id)
          ? state.selectedSourceIds.filter((sourceId) => sourceId !== id)
          : [...state.selectedSourceIds, id],
      })),

    setLanguage: (language) => {
      set({ language })
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
      }
    },

    discover: async () => {
      set({ fetching: true })
      try {
        const response = await pb.send<{
          items: DiscoverCandidate[]
          failures: DiscoverFailure[]
        }>("/api/reading/discover", {
          method: "POST",
          body: { sourceIds: get().selectedSourceIds },
          requestKey: null,
        })
        set({
          candidates: response.items ?? [],
          failures: response.failures ?? [],
          summaries: {},
          fetched: true,
        })
        // The sources carry a fresh fetch time and error now.
        await get().loadSources()
      } catch (error) {
        toast.error(readingErrorMessage(error, "Could not fetch subscriptions"))
      } finally {
        set({ fetching: false })
      }
    },

    summarizeCandidate: async (candidate) => {
      const language = get().language
      set({ summarizingUrl: candidate.url })
      try {
        const response = await pb.send<{
          summary: string
          keyPoints: string[]
        }>("/api/reading/discover/summarize", {
          method: "POST",
          body: {
            url: candidate.url,
            title: candidate.title,
            language,
          },
          requestKey: null,
        })
        set((state) => ({
          summaries: {
            ...state.summaries,
            [candidate.url]: {
              summary: response.summary,
              keyPoints: response.keyPoints ?? [],
              language,
            },
          },
        }))
      } catch (error) {
        toast.error(
          readingErrorMessage(error, "Could not summarize this candidate")
        )
      } finally {
        set({ summarizingUrl: null })
      }
    },

    saveCandidate: async (candidate) => {
      const ownerId = pb.authStore.record?.id
      if (!ownerId) throw new Error("You must be signed in to save a candidate")
      const summary = get().summaries[candidate.url]
      set({ savingUrl: candidate.url })
      try {
        await pb.collection("reading_items").create({
          owner: ownerId,
          url: candidate.url,
          title: candidate.title.slice(0, 240),
          description: candidate.description || "",
          tags: candidate.language ? [candidate.language] : [],
          status: "unread",
          summary: summary?.summary || "",
          key_points: summary?.keyPoints || [],
          summary_language: summary?.language || "",
        })
        set((state) => ({
          candidates: state.candidates.map((item) =>
            item.url === candidate.url ? { ...item, alreadySaved: true } : item
          ),
          savedCount: state.savedCount + 1,
        }))
      } catch (error) {
        toast.error(
          readingErrorMessage(error, "Could not add this candidate to reading")
        )
      } finally {
        set({ savingUrl: null })
      }
    },

    // flushSaved refreshes the reading list once the panel closes, instead of
    // after every kept candidate.
    flushSaved: async () => {
      if (get().savedCount === 0) return
      const saved = get().savedCount
      set({ savedCount: 0 })
      await useReadingStore.getState().fetchItems(1)
      toast.success(
        saved === 1 ? "Added 1 reading item" : `Added ${saved} reading items`
      )
    },
  })
)

export const TRENDING_SINCE_LABELS: Record<TrendingSince, string> = {
  daily: "today",
  weekly: "this week",
  monthly: "this month",
}
