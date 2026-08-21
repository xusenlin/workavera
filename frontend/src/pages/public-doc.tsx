import { useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "react-router"

import { MessageResponse } from "@/components/ai-elements/message"
import { Spinner } from "@/components/ui/spinner"
import { withPublicDocAssets } from "@/lib/doc-assets"
import { htmlPreviewSrcDoc } from "@/lib/html-preview"
import { pb } from "@/lib/pocketbase"
import { cn } from "@/lib/utils"

type PublicDocument = {
  title: string
  kind: "markdown" | "html"
  content: string
  revision: number
  published: string
}

/**
 * The only page an anonymous visitor can reach. It renders one published
 * snapshot resolved from an unguessable slug, and never touches the auth
 * store: a signed-out visitor and the author see exactly the same thing.
 */
type LoadState =
  | { status: "loading" }
  | { status: "ready"; document: PublicDocument }
  | { status: "unavailable" }

export function PublicDocPage() {
  const { slug = "" } = useParams()
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const document = state.status === "ready" ? state.document : null
  const unavailable = state.status === "unavailable"

  useEffect(() => {
    let active = true
    void pb
      .send<PublicDocument>(`/api/public/docs/${encodeURIComponent(slug)}`, {
        requestKey: null,
      })
      .then((result) => {
        if (active) setState({ status: "ready", document: result })
      })
      .catch(() => {
        if (active) setState({ status: "unavailable" })
      })
    return () => {
      active = false
    }
  }, [slug])

  const content = useMemo(
    () => (document ? withPublicDocAssets(document.content, slug) : ""),
    [document, slug]
  )

  useEffect(() => {
    if (document) window.document.title = document.title
  }, [document])

  if (unavailable) {
    return (
      <PublicDocLayout>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="text-lg font-medium">This link is not available</p>
          <p className="text-sm text-muted-foreground">
            It may have expired, been revoked, or never existed.
          </p>
        </div>
      </PublicDocLayout>
    )
  }

  if (!document) {
    return (
      <PublicDocLayout>
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="size-6" />
        </div>
      </PublicDocLayout>
    )
  }

  if (document.kind === "html") {
    return (
      <PublicDocLayout>
        {/* Same isolation as the editor preview: srcdoc with a sandbox that
            withholds allow-same-origin runs the document in an opaque origin. */}
        <iframe
          title={document.title}
          srcDoc={htmlPreviewSrcDoc(content)}
          sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"
          referrerPolicy="no-referrer"
          className="min-h-0 w-full flex-1 bg-white"
        />
      </PublicDocLayout>
    )
  }

  // The document supplies its own heading, so the page adds no chrome of its
  // own around it; the title only names the browser tab.
  return (
    <PublicDocLayout>
      <MarkdownReader content={content} />
    </PublicDocLayout>
  )
}

function PublicDocLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-svh flex-col">{children}</div>
}

type OutlineEntry = { id: string; text: string; level: number }

/**
 * Reading aids for a long shared document: a progress bar across the top and a
 * jumpable outline beside the text. Both read the window scroll, because the
 * page itself scrolls rather than an inner container.
 */
function MarkdownReader({ content }: { content: string }) {
  const contentRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const outline = useMemo(() => markdownOutline(content), [content])
  const [progress, setProgress] = useState(0)
  const [activeId, setActiveId] = useState("")

  // Streamdown renders headings without ids, so they are labelled here in the
  // same order the outline was parsed from the source.
  useEffect(() => {
    const root = contentRef.current
    if (!root) return
    const headings = root.querySelectorAll<HTMLElement>("h1, h2, h3")
    outline.forEach((entry, index) => {
      const heading = headings[index]
      if (heading) heading.id = entry.id
    })
  }, [outline])

  useEffect(() => {
    const update = () => {
      const scrollable =
        window.document.documentElement.scrollHeight - window.innerHeight
      setProgress(scrollable > 0 ? window.scrollY / scrollable : 0)

      const root = contentRef.current
      if (!root) return
      let current = ""
      for (const entry of outline) {
        const heading = window.document.getElementById(entry.id)
        if (heading && heading.getBoundingClientRect().top <= 96) {
          current = entry.id
        }
      }
      setActiveId(current)
    }
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [outline])

  const active = activeId || outline[0]?.id

  // A long outline scrolls independently of the page, so the entry the reader
  // has arrived at would otherwise drift out of its box.
  useEffect(() => {
    const nav = navRef.current
    if (!nav || !active) return
    const item = nav.querySelector<HTMLElement>(`[data-outline-id="${active}"]`)
    if (!item) return
    const top =
      item.getBoundingClientRect().top -
      nav.getBoundingClientRect().top +
      nav.scrollTop
    const bottom = top + item.offsetHeight
    // Keep an entry's neighbours in view rather than parking it on an edge.
    const margin = 32
    if (top - margin < nav.scrollTop) {
      nav.scrollTo({ top: Math.max(0, top - margin), behavior: "smooth" })
    } else if (bottom + margin > nav.scrollTop + nav.clientHeight) {
      nav.scrollTo({
        top: bottom + margin - nav.clientHeight,
        behavior: "smooth",
      })
    }
  }, [active])

  return (
    <>
      <div
        aria-hidden
        className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-foreground/80 transition-transform duration-75"
        style={{ transform: `scaleX(${progress})` }}
      />
      {/* Side columns of equal fixed width keep the document centred in the
          viewport while the outline sits against the right edge; the text
          column takes what is left. Below 1360px there is no room for both, so
          the outline steps aside and the text spans the page. */}
      <div className="grid w-full flex-1 grid-cols-1 min-[1360px]:grid-cols-[20rem_minmax(0,1fr)_20rem]">
        <div className="hidden min-[1360px]:block" />
        <div
          ref={contentRef}
          className="workavera-doc-reader mx-auto w-full max-w-4xl min-w-0 px-5 pt-10 pb-20 md:px-8"
        >
          <MessageResponse>{content}</MessageResponse>
        </div>
        {outline.length > 1 && (
          <aside className="hidden px-8 py-10 min-[1360px]:block">
            <nav
              aria-label="Outline"
              ref={navRef}
              className="workavera-doc-outline sticky top-10 max-h-[80svh] w-full overflow-y-auto"
            >
              <ul className="flex flex-col gap-1.5 border-l text-sm">
                {outline.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      data-outline-id={entry.id}
                      onClick={() =>
                        window.document
                          .getElementById(entry.id)
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          })
                      }
                      className={cn(
                        "-ml-px block w-full border-l border-transparent py-1 pr-4 text-left leading-relaxed transition-colors hover:text-foreground",
                        entry.level === 2 && "pl-7",
                        entry.level >= 3 && "pl-11",
                        entry.level <= 1 && "pl-4",
                        entry.id === active
                          ? "border-foreground text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {entry.text}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        )}
      </div>
    </>
  )
}

const FENCE = /^\s*(```|~~~)/
const ATX_HEADING = /^(#{1,3})\s+(.+?)\s*#*\s*$/

/**
 * Collects the document's own headings. Fenced code is skipped so a shell
 * comment never turns into an outline entry.
 */
function markdownOutline(content: string): OutlineEntry[] {
  const entries: OutlineEntry[] = []
  let fenced = false
  for (const line of content.split("\n")) {
    if (FENCE.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const heading = ATX_HEADING.exec(line)
    if (!heading) continue
    const text = heading[2].replace(/[*_`[\]]/g, "").trim()
    if (!text) continue
    entries.push({
      id: `section-${entries.length}`,
      text,
      level: heading[1].length,
    })
  }
  return entries
}
