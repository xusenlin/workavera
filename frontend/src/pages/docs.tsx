import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Archive02Icon,
  ArchiveRestoreIcon,
  Delete02Icon,
  DocumentAttachmentIcon,
  Download01Icon,
  File02Icon,
  FloppyDiskIcon,
  FolderTransferIcon,
  HistoryIcon,
  Maximize01Icon,
  Minimize01Icon,
  MoreHorizontalIcon,
  Pin02Icon,
  Search02Icon,
  SourceCodeIcon,
} from "@hugeicons/core-free-icons"
import { ClientResponseError, type RecordModel } from "pocketbase"
import { toast } from "sonner"

import {
  BlockNoteDocumentEditor,
  type DocumentEditorMode,
} from "@/components/docs/blocknote-document-editor"
import { documentMarkdownToStandaloneHtml } from "@/components/docs/doc-export"
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
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SourceCodeEditor } from "@/components/docs/source-code-editor"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
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
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { extractErrorMessage, isRequestAbort } from "@/lib/error"
import { pb } from "@/lib/pocketbase"
import { cn } from "@/lib/utils"
import {
  requestedRecordId,
  workspaceRecordUrl,
} from "@/lib/workspace-navigation"

type DocKind = "markdown" | "html"

type DocRecord = RecordModel & {
  title: string
  kind: DocKind
  content: string
  owner: string
  project: string
  status: "draft" | "archived"
  revision: number
  last_edited_by: string
  updated: string
}

type DocumentResult = {
  id: string
  title: string
  kind: DocKind
  content: string
  ownerId: string
  projectId?: string
  projectName?: string
  status: "draft" | "archived"
  revision: number
  lastEditedBy: string
  created: string
  updated: string
}

type Version = {
  id: string
  revision: number
  title: string
  content?: string
  createdBy: string
  source: "user" | "ai" | "restore"
  created: string
}

type Project = { id: string; name: string }

const DOCS_PAGE_SIZE = 15

export function DocsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedDocId = requestedRecordId(searchParams)
  const [documents, setDocuments] = useState<DocRecord[]>([])
  const [pinnedDocuments, setPinnedDocuments] = useState<DocumentResult[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [editableProjects, setEditableProjects] = useState<Project[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [persisted, setPersisted] = useState<DocumentResult | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
  const [draftContent, setDraftContent] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [serverHasNewVersion, setServerHasNewVersion] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<DocumentEditorMode>("rich-text")
  const [htmlMode, setHtmlMode] = useState<"preview" | "source">("preview")
  const [fullscreen, setFullscreen] = useState(false)
  const editorAreaRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const updateFullscreen = () => {
      setFullscreen(document.fullscreenElement === editorAreaRef.current)
    }
    document.addEventListener("fullscreenchange", updateFullscreen)
    return () =>
      document.removeEventListener("fullscreenchange", updateFullscreen)
  }, [])

  const toggleFullscreen = async () => {
    if (document.fullscreenElement === editorAreaRef.current) {
      await document.exitFullscreen()
      return
    }
    await editorAreaRef.current?.requestFullscreen()
  }

  const dirty = Boolean(
    persisted &&
    (draftTitle !== persisted.title || draftContent !== persisted.content)
  )
  const loadList = useCallback(
    async (targetPage = page) => {
      const actorId = pb.authStore.record?.id ?? ""
      const escapedQuery = query.trim().replaceAll('"', '\\"')
      const pinned = await pb.send<DocumentResult[]>("/api/docs-pinned", {})
      const queryLower = query.trim().toLowerCase()
      const visiblePinned = queryLower
        ? pinned.filter(
            (doc) =>
              doc.title.toLowerCase().includes(queryLower) ||
              doc.content.toLowerCase().includes(queryLower)
          )
        : pinned
      const filters = ['status = "draft"']
      if (escapedQuery) {
        filters.push(
          `(title ~ "${escapedQuery}" || content ~ "${escapedQuery}")`
        )
      }
      for (const doc of pinned) filters.push(`id != "${doc.id}"`)
      const [docResult, projectRecords, memberships] = await Promise.all([
        pb.collection("docs").getList<DocRecord>(targetPage, DOCS_PAGE_SIZE, {
          sort: "-updated",
          filter: filters.join(" && "),
        }),
        pb
          .collection("board_projects")
          .getFullList<RecordModel & { name: string; owner: string }>({
            sort: "name",
          }),
        actorId
          ? pb
              .collection("board_project_members")
              .getFullList<RecordModel & { project: string; role: string }>({
                filter: `user = "${actorId}"`,
              })
          : Promise.resolve([]),
      ])
      const editableMemberships = new Set(
        memberships
          .filter((membership) => membership.role !== "viewer")
          .map((membership) => membership.project)
      )
      setPinnedDocuments(visiblePinned)
      setDocuments(docResult.items)
      setTotalPages(Math.max(1, docResult.totalPages))
      setTotalItems(docResult.totalItems + visiblePinned.length)
      setProjects(projectRecords.map(({ id, name }) => ({ id, name })))
      setEditableProjects(
        projectRecords
          .filter(
            (project) =>
              project.owner === actorId || editableMemberships.has(project.id)
          )
          .map(({ id, name }) => ({ id, name }))
      )
      setSelectedId((current) => {
        if (current) return current
        return pinned[0]?.id ?? docResult.items[0]?.id ?? null
      })
    },
    [page, query]
  )

  // Selection can change while a document fetch is in flight (URL sync and
  // selection updates land in separate commits, so switching briefly ping-pongs
  // through the previous document). Only the newest load may apply its result;
  // a stale response must never overwrite the document loaded after it.
  const loadDocumentSeq = useRef(0)
  const loadDocument = useCallback(async (id: string) => {
    const seq = ++loadDocumentSeq.current
    const record = await pb.collection("docs").getOne<DocRecord>(id)
    const project = record.project
      ? await pb
          .collection("board_projects")
          .getOne<RecordModel & { name: string }>(record.project)
          .catch(() => null)
      : null
    if (seq !== loadDocumentSeq.current) return
    const doc: DocumentResult = {
      id: record.id,
      title: record.title,
      kind: record.kind === "html" ? "html" : "markdown",
      content: record.content,
      ownerId: record.owner,
      projectId: record.project || undefined,
      projectName: project?.name,
      status: record.status,
      revision: record.revision,
      lastEditedBy: record.last_edited_by,
      created: record.created,
      updated: record.updated,
    }
    setPersisted(doc)
    setDraftTitle(doc.title)
    setDraftContent(doc.content)
    setServerHasNewVersion(false)
    setEditorMode("rich-text")
    setHtmlMode("preview")
  }, [])

  useEffect(() => {
    void Promise.resolve()
      .then(() => loadList())
      .catch((error) => {
        if (isRequestAbort(error)) return
        toast.error(extractErrorMessage(error, "Could not load documents."))
      })
      .finally(() => setLoading(false))
  }, [loadList])

  useEffect(() => {
    if (!requestedDocId || requestedDocId === selectedId) return
    if (dirty && !window.confirm("Discard your unsaved changes?")) {
      if (selectedId) {
        navigate(workspaceRecordUrl("docs", selectedId), { replace: true })
      }
      return
    }
    void Promise.resolve().then(() => setSelectedId(requestedDocId))
  }, [dirty, navigate, requestedDocId, selectedId])

  useEffect(() => {
    if (!requestedDocId && selectedId) {
      navigate(workspaceRecordUrl("docs", selectedId), { replace: true })
    }
  }, [navigate, requestedDocId, selectedId])

  useEffect(() => {
    if (!selectedId) return
    void Promise.resolve()
      .then(() => loadDocument(selectedId))
      .catch((error) => {
        if (isRequestAbort(error)) return
        toast.error(extractErrorMessage(error, "Could not load the document."))
        if (requestedDocId === selectedId) {
          setSelectedId(null)
          setPersisted(null)
          navigate("/docs", { replace: true })
        }
      })
  }, [loadDocument, navigate, requestedDocId, selectedId])

  useEffect(() => {
    if (!selectedId) return
    void pb.collection("docs").subscribe<DocRecord>(selectedId, (event) => {
      if (event.action === "delete") return
      if (event.record.revision <= (persisted?.revision ?? 0)) return
      if (dirty) {
        setServerHasNewVersion(true)
      } else {
        void loadDocument(selectedId)
      }
      void loadList()
    })
    return () => {
      void pb.collection("docs").unsubscribe(selectedId)
    }
  }, [dirty, loadDocument, loadList, persisted?.revision, selectedId])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const selectDocument = (id: string) => {
    if (id === selectedId) return
    if (dirty && !window.confirm("Discard your unsaved changes?")) return
    setSelectedId(id)
    navigate(workspaceRecordUrl("docs", id), { replace: true })
  }

  const save = async () => {
    if (!persisted || !dirty || saving) return
    setSaving(true)
    try {
      const result = await pb.send<{
        document: DocumentResult
        changed: boolean
      }>(`/api/docs/${persisted.id}`, {
        method: "PUT",
        body: {
          title: draftTitle,
          content: draftContent,
          baseRevision: persisted.revision,
        },
      })
      setPersisted(result.document)
      setDraftTitle(result.document.title)
      setDraftContent(result.document.content)
      setServerHasNewVersion(false)
      await loadList()
      toast.success(
        result.changed
          ? `Saved revision ${result.document.revision}.`
          : "No changes to save."
      )
    } catch (error) {
      if (error instanceof ClientResponseError && error.status === 409) {
        setServerHasNewVersion(true)
        toast.error("A newer version exists. Your draft has been kept.")
      } else {
        toast.error(extractErrorMessage(error, "Could not save the document."))
      }
    } finally {
      setSaving(false)
    }
  }

  const exportMarkdown = () => {
    downloadFile(
      `${exportFileName(draftTitle)}.md`,
      draftContent,
      "text/markdown;charset=utf-8"
    )
  }

  const exportHtml = async () => {
    // HTML documents are already standalone files; export their source as-is
    // instead of wrapping it through the Markdown export pipeline.
    if (persisted?.kind === "html") {
      downloadFile(
        `${exportFileName(draftTitle)}.html`,
        draftContent,
        "text/html;charset=utf-8"
      )
      return
    }
    try {
      const html = await documentMarkdownToStandaloneHtml(
        draftContent,
        draftTitle.trim() || "Untitled document"
      )
      downloadFile(
        `${exportFileName(draftTitle)}.html`,
        html,
        "text/html;charset=utf-8"
      )
    } catch (error) {
      toast.error(extractErrorMessage(error, "Could not export the document."))
    }
  }

  const togglePin = async (id: string, pinned: boolean) => {
    try {
      await pb.send(`/api/docs/${id}/pin`, {
        method: "POST",
        body: { pinned: !pinned },
      })
      await loadList()
    } catch (error) {
      toast.error(extractErrorMessage(error, "Could not update pin."))
    }
  }

  const archiveDocument = async (id: string) => {
    try {
      await pb.send(`/api/docs/${id}/archive`, { method: "POST" })
      if (selectedId === id) {
        setSelectedId(null)
        setPersisted(null)
        navigate("/docs", { replace: true })
      }
      await loadList()
      toast.success("Document archived.")
    } catch (error) {
      toast.error(extractErrorMessage(error, "Could not archive document."))
    }
  }

  const deleteDocument = async (id: string) => {
    try {
      await pb.send(`/api/docs/${id}`, { method: "DELETE" })
      if (selectedId === id) {
        setSelectedId(null)
        setPersisted(null)
        navigate("/docs", { replace: true })
      }
      await loadList()
      toast.success("Document deleted.")
    } catch (error) {
      toast.error(extractErrorMessage(error, "Could not delete document."))
    }
  }

  return (
    <div className="-m-4 flex h-[calc(100vh-4rem)] overflow-hidden md:-m-6">
      <aside className="flex w-72 shrink-0 flex-col border-r bg-sidebar">
        <div className="space-y-3 border-b p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Documents</p>
              <p className="text-xs text-muted-foreground">
                {totalItems} total
              </p>
            </div>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setArchivedOpen(true)}
                aria-label="View archived"
              >
                <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setCreateOpen(true)}
                aria-label="New document"
              >
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
              </Button>
            </div>
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
                setLoading(true)
                setQuery(event.target.value)
                setPage(1)
              }}
              placeholder="Search docs…"
              className="h-8 pl-8"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : pinnedDocuments.length === 0 && documents.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              No documents yet.
            </p>
          ) : (
            <div className="space-y-3">
              <DocumentGroup
                label="Pinned"
                documents={pinnedDocuments.map((doc) => ({
                  id: doc.id,
                  title: doc.title,
                  kind: doc.kind,
                  owner: doc.ownerId,
                  project: doc.projectId ?? "",
                  revision: doc.revision,
                  pinned: true,
                }))}
                selectedId={selectedId}
                projects={projects}
                onSelect={selectDocument}
                onTogglePin={togglePin}
                onArchive={archiveDocument}
                onDelete={deleteDocument}
              />
              <DocumentGroup
                label="Recent"
                documents={documents.map((doc) => ({
                  id: doc.id,
                  title: doc.title,
                  kind: doc.kind,
                  owner: doc.owner,
                  project: doc.project,
                  revision: doc.revision,
                  pinned: false,
                }))}
                selectedId={selectedId}
                projects={projects}
                onSelect={selectDocument}
                onTogglePin={togglePin}
                onArchive={archiveDocument}
                onDelete={deleteDocument}
              />
            </div>
          )}
        </div>
        {!loading && totalPages > 0 && (
          <Pagination className="justify-end px-2 py-1">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  text="Prev"
                  onClick={() => {
                    setLoading(true)
                    setPage((current) => Math.max(1, current - 1))
                  }}
                  className={
                    page <= 1 || loading
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>
              <span className="flex items-center px-2 text-xs text-muted-foreground">
                {page} / {Math.max(1, totalPages)}
              </span>
              <PaginationItem>
                <PaginationNext
                  text="Next"
                  onClick={() => {
                    setLoading(true)
                    setPage((current) => Math.min(totalPages, current + 1))
                  }}
                  className={
                    page >= totalPages || loading
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </aside>

      <main
        ref={editorAreaRef}
        className="flex min-w-0 flex-1 flex-col bg-background"
      >
        {persisted ? (
          <>
            <div className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-5">
              <Input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder="Untitled document"
                className="[field-sizing:content] h-8 w-auto max-w-[min(36rem,50vw)] min-w-32 flex-none border-transparent bg-transparent px-2 text-base font-semibold shadow-none hover:border-border focus-visible:border-border focus-visible:ring-0"
                aria-label="Document title"
              />
              <span
                className={cn(
                  "shrink-0 text-xs text-muted-foreground",
                  serverHasNewVersion && "text-amber-600"
                )}
              >
                {serverHasNewVersion
                  ? "New version available"
                  : dirty
                    ? `Unsaved · v${persisted.revision}`
                    : `v${persisted.revision}`}
              </span>
              <div className="ml-auto flex items-center gap-1">
                {!persisted.projectId && (
                  <MoveToProjectButton
                    document={persisted}
                    projects={editableProjects}
                    onMoved={async (doc) => {
                      setPersisted(doc)
                      await loadList()
                    }}
                  />
                )}
                {serverHasNewVersion && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void loadDocument(persisted.id)}
                  >
                    Load latest
                  </Button>
                )}
                {persisted.kind === "html" ? (
                  <HeaderIconButton
                    label={
                      htmlMode === "source"
                        ? "Show preview"
                        : "Edit HTML source"
                    }
                    icon={SourceCodeIcon}
                    active={htmlMode === "source"}
                    onClick={() =>
                      setHtmlMode((current) =>
                        current === "source" ? "preview" : "source"
                      )
                    }
                  />
                ) : (
                  <HeaderIconButton
                    label={
                      editorMode === "source"
                        ? "Switch to rich text"
                        : "Edit Markdown source"
                    }
                    icon={SourceCodeIcon}
                    active={editorMode === "source"}
                    onClick={() =>
                      setEditorMode((current) =>
                        current === "source" ? "rich-text" : "source"
                      )
                    }
                  />
                )}
                <HeaderIconButton
                  label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                  icon={fullscreen ? Minimize01Icon : Maximize01Icon}
                  onClick={() => void toggleFullscreen()}
                />
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Export"
                        >
                          <HugeiconsIcon icon={Download01Icon} strokeWidth={2} />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Export</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="end">
                    {persisted.kind !== "html" && (
                      <DropdownMenuItem onClick={exportMarkdown}>
                        Markdown (.md)
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => void exportHtml()}>
                      HTML (.html)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <HeaderIconButton
                  label="Version history"
                  icon={HistoryIcon}
                  onClick={() => setHistoryOpen(true)}
                />
                <HeaderIconButton
                  label={saving ? "Saving…" : "Save"}
                  icon={FloppyDiskIcon}
                  loading={saving}
                  disabled={!dirty || saving || !draftTitle.trim()}
                  onClick={() => void save()}
                />
              </div>
            </div>
            {persisted.kind === "html" ? (
              htmlMode === "source" ? (
                <div className="workavera-doc-editor">
                  <SourceCodeEditor
                    language="html"
                    value={draftContent}
                    onChange={setDraftContent}
                  />
                </div>
              ) : draftContent.trim() === "" ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                  <HugeiconsIcon
                    icon={SourceCodeIcon}
                    strokeWidth={1.5}
                    className="size-10"
                  />
                  <p className="text-sm">
                    This document is empty. Edit the HTML source to add
                    content.
                  </p>
                </div>
              ) : (
                // srcdoc + sandbox without allow-same-origin runs the document
                // in an opaque origin: scripts work but can never reach the
                // parent page or its PocketBase session.
                <iframe
                  key={persisted.id}
                  title={`${draftTitle || "HTML document"} preview`}
                  srcDoc={draftContent}
                  sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"
                  referrerPolicy="no-referrer"
                  className="min-h-0 w-full flex-1 bg-white"
                />
              )
            ) : (
              <BlockNoteDocumentEditor
                key={persisted.id}
                docId={persisted.id}
                value={draftContent}
                mode={editorMode}
                onChange={setDraftContent}
              />
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <HugeiconsIcon
              icon={DocumentAttachmentIcon}
              strokeWidth={1.5}
              className="size-10"
            />
            <p className="text-sm">Select a document or create a new one.</p>
          </div>
        )}
      </main>

      <CreateDocumentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projects={editableProjects}
        onCreated={async (doc) => {
          setPage(1)
          await loadList(1)
          setSelectedId(doc.id)
          navigate(workspaceRecordUrl("docs", doc.id), { replace: true })
        }}
      />
      <ArchivedDocumentsDialog
        open={archivedOpen}
        onOpenChange={setArchivedOpen}
        onChanged={() => loadList()}
      />
      {persisted && (
        <HistoryDialog
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          document={persisted}
          onRestored={async (doc) => {
            setPersisted(doc)
            setDraftTitle(doc.title)
            setDraftContent(doc.content)
            setEditorMode("rich-text")
            setHtmlMode("preview")
            await loadList()
          }}
        />
      )}
    </div>
  )
}

function HeaderIconButton({
  label,
  icon,
  active = false,
  loading = false,
  disabled = false,
  onClick,
}: {
  label: string
  icon: typeof FloppyDiskIcon
  active?: boolean
  loading?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {loading ? (
            <Spinner className="size-4" />
          ) : (
            <HugeiconsIcon icon={icon} strokeWidth={2} />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

type DocumentListEntry = {
  id: string
  title: string
  kind: DocKind
  owner: string
  project: string
  revision: number
  pinned: boolean
}

function DocumentGroup({
  label,
  documents,
  selectedId,
  projects,
  onSelect,
  onTogglePin,
  onArchive,
  onDelete,
}: {
  label: string
  documents: DocumentListEntry[]
  selectedId: string | null
  projects: Project[]
  onSelect: (id: string) => void
  onTogglePin: (id: string, pinned: boolean) => Promise<void>
  onArchive: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  if (documents.length === 0) return null
  return (
    <section>
      <p className="px-3 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <div className="space-y-1">
        {documents.map((doc) => (
          <DocumentListItem
            key={doc.id}
            document={doc}
            active={selectedId === doc.id}
            projectName={
              doc.project ? projectName(projects, doc.project) : "Private"
            }
            onSelect={() => onSelect(doc.id)}
            onTogglePin={() => onTogglePin(doc.id, doc.pinned)}
            onArchive={() => onArchive(doc.id)}
            onDelete={() => onDelete(doc.id)}
          />
        ))}
      </div>
    </section>
  )
}

function DocumentListItem({
  document,
  active,
  projectName,
  onSelect,
  onTogglePin,
  onArchive,
  onDelete,
}: {
  document: DocumentListEntry
  active: boolean
  projectName: string
  onSelect: () => void
  onTogglePin: () => Promise<void>
  onArchive: () => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isCreator = document.owner === pb.authStore.record?.id
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onSelect()
        }}
        className={cn(
          "group relative cursor-pointer rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/60",
          active && "bg-muted"
        )}
      >
        <div className="flex items-center gap-1.5 pr-6">
          {document.pinned && (
            <HugeiconsIcon
              icon={Pin02Icon}
              strokeWidth={2}
              className="size-3 shrink-0 text-muted-foreground"
            />
          )}
          <HugeiconsIcon
            icon={document.kind === "html" ? SourceCodeIcon : File02Icon}
            strokeWidth={2}
            className="size-3 shrink-0 text-muted-foreground"
            aria-label={
              document.kind === "html" ? "HTML document" : "Markdown document"
            }
          />
          <p className="truncate text-sm font-medium">{document.title}</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {projectName} · v{document.revision}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Document actions"
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
              onClick={(event) => event.stopPropagation()}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(event) => event.stopPropagation()}
          >
            <DropdownMenuItem onClick={() => void onTogglePin()}>
              <HugeiconsIcon icon={Pin02Icon} strokeWidth={2} />
              {document.pinned ? "Unpin" : "Pin"}
            </DropdownMenuItem>
            {isCreator && (
              <>
                <DropdownMenuItem onClick={() => void onArchive()}>
                  <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} />
                  Archive
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              “{document.title}” and all of its versions will be permanently
              deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void onDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ArchivedDocumentsDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => Promise<void>
}) {
  const [items, setItems] = useState<DocRecord[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<DocRecord | null>(null)

  const load = useCallback(async () => {
    const result = await pb.collection("docs").getList<DocRecord>(page, 10, {
      filter: 'status = "archived"',
      sort: "-updated",
    })
    setItems(result.items)
    setTotalPages(Math.max(1, result.totalPages))
  }, [page])

  useEffect(() => {
    if (!open) return
    void Promise.resolve()
      .then(load)
      .catch((error) => {
        if (isRequestAbort(error)) return
        toast.error(extractErrorMessage(error, "Could not load archive."))
      })
      .finally(() => setLoading(false))
  }, [load, open])

  const unarchive = async (id: string) => {
    try {
      await pb.send(`/api/docs/${id}/unarchive`, { method: "POST" })
      await Promise.all([load(), onChanged()])
      toast.success("Document restored.")
    } catch (error) {
      toast.error(extractErrorMessage(error, "Could not restore document."))
    }
  }

  const remove = async () => {
    if (!deleteTarget) return
    try {
      await pb.send(`/api/docs/${deleteTarget.id}`, { method: "DELETE" })
      setDeleteTarget(null)
      await Promise.all([load(), onChanged()])
      toast.success("Document deleted.")
    } catch (error) {
      toast.error(extractErrorMessage(error, "Could not delete document."))
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HugeiconsIcon icon={Archive02Icon} className="size-4" />
              Archived documents
            </DialogTitle>
            <DialogDescription>
              Only document creators can restore or permanently delete their
              documents.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-10">
                <Spinner />
              </div>
            ) : items.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No archived documents.
              </p>
            ) : (
              items.map((doc) => {
                const isCreator = doc.owner === pb.authStore.record?.id
                return (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {doc.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Revision {doc.revision}
                      </p>
                    </div>
                    {isCreator && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Restore document"
                          onClick={() => void unarchive(doc.id)}
                        >
                          <HugeiconsIcon
                            icon={ArchiveRestoreIcon}
                            strokeWidth={2}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Delete document"
                          onClick={() => setDeleteTarget(doc)}
                        >
                          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                        </Button>
                      </>
                    )}
                  </div>
                )
              })
            )}
          </div>
          {!loading && items.length > 0 && (
            <Pagination className="justify-end pt-2">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    text="Prev"
                    onClick={() => {
                      setLoading(true)
                      setPage((value) => Math.max(1, value - 1))
                    }}
                    className={
                      page <= 1 || loading
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>
                <span className="flex items-center px-2 text-xs text-muted-foreground">
                  {page} / {Math.max(1, totalPages)}
                </span>
                <PaginationItem>
                  <PaginationNext
                    text="Next"
                    onClick={() => {
                      setLoading(true)
                      setPage((value) => Math.min(totalPages, value + 1))
                    }}
                    className={
                      page >= totalPages || loading
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(value) => !value && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.title}” and every saved version will be deleted.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function CreateDocumentDialog({
  open,
  onOpenChange,
  projects,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: Project[]
  onCreated: (doc: DocumentResult) => Promise<void>
}) {
  const [title, setTitle] = useState("")
  const [kind, setKind] = useState<DocKind>("markdown")
  const [location, setLocation] = useState<"private" | "project">("private")
  const [projectId, setProjectId] = useState("")
  const [saving, setSaving] = useState(false)
  const create = async () => {
    setSaving(true)
    try {
      const doc = await pb.send<DocumentResult>("/api/docs", {
        method: "POST",
        body: {
          title,
          kind,
          content: "",
          projectId: location === "private" ? "" : projectId,
        },
      })
      await onCreated(doc)
      setTitle("")
      setKind("markdown")
      setLocation("private")
      setProjectId("")
      onOpenChange(false)
    } catch (error) {
      toast.error(extractErrorMessage(error, "Could not create document."))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New document</DialogTitle>
          <DialogDescription>
            Create a private note or a document shared with a project.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="doc-title">Title</Label>
            <Input
              id="doc-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-3">
            <Label>Kind</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setKind("markdown")}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors hover:bg-muted/50",
                  kind === "markdown" &&
                    "border-foreground/30 bg-muted ring-1 ring-foreground/10"
                )}
              >
                <span className="block text-sm font-medium">Markdown</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  Notes and knowledge with rich-text editing.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setKind("html")}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors hover:bg-muted/50",
                  kind === "html" &&
                    "border-foreground/30 bg-muted ring-1 ring-foreground/10"
                )}
              >
                <span className="block text-sm font-medium">HTML app</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  A self-contained interactive page with sandboxed preview.
                </span>
              </button>
            </div>
          </div>
          <div className="space-y-3">
            <Label>Who can access it?</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setLocation("private")}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors hover:bg-muted/50",
                  location === "private" &&
                    "border-foreground/30 bg-muted ring-1 ring-foreground/10"
                )}
              >
                <span className="block text-sm font-medium">Private</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  Only you can open and edit this document.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setLocation("project")}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors hover:bg-muted/50",
                  location === "project" &&
                    "border-foreground/30 bg-muted ring-1 ring-foreground/10"
                )}
              >
                <span className="block text-sm font-medium">Project</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  Share it with members of one project.
                </span>
              </button>
            </div>
            {location === "project" && (
              <div className="space-y-2 pt-1">
                <Label>Project</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {projects.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    You do not have an editable project yet.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              !title.trim() || saving || (location === "project" && !projectId)
            }
            onClick={() => void create()}
          >
            {saving ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MoveToProjectButton({
  document,
  projects,
  onMoved,
}: {
  document: DocumentResult
  projects: Project[]
  onMoved: (doc: DocumentResult) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [projectId, setProjectId] = useState("")
  const move = async () => {
    if (!projectId) return
    try {
      const doc = await pb.send<DocumentResult>(
        `/api/docs/${document.id}/move-to-project`,
        { method: "POST", body: { projectId } }
      )
      await onMoved(doc)
      setOpen(false)
      toast.success("Document moved to project.")
    } catch (error) {
      toast.error(extractErrorMessage(error, "Could not move document."))
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <HeaderIconButton
        label="Move to project"
        icon={FolderTransferIcon}
        onClick={() => setOpen(true)}
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move to project</DialogTitle>
          <DialogDescription>
            Project members will inherit access. This document cannot be moved
            back in the first version.
          </DialogDescription>
        </DialogHeader>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger>
            <SelectValue placeholder="Select project" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!projectId} onClick={() => void move()}>
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HistoryDialog({
  open,
  onOpenChange,
  document,
  onRestored,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  document: DocumentResult
  onRestored: (doc: DocumentResult) => Promise<void>
}) {
  const [versions, setVersions] = useState<Version[]>([])
  const [selected, setSelected] = useState<Version | null>(null)
  useEffect(() => {
    if (!open) return
    void pb
      .send<Version[]>(`/api/docs/${document.id}/versions`, {})
      .then(setVersions)
      .catch((error) => {
        if (isRequestAbort(error)) return
        toast.error(extractErrorMessage(error, "Could not load history."))
      })
  }, [document.id, open])
  const inspect = async (version: Version) => {
    const full = await pb.send<Version>(
      `/api/docs/${document.id}/versions/${version.revision}`,
      {}
    )
    setSelected(full)
  }
  const restore = async () => {
    if (!selected) return
    try {
      const doc = await pb.send<DocumentResult>(
        `/api/docs/${document.id}/restore/${selected.revision}`,
        { method: "POST", body: { baseRevision: document.revision } }
      )
      await onRestored(doc)
      onOpenChange(false)
      toast.success(`Restored as revision ${doc.revision}.`)
    } catch (error) {
      toast.error(extractErrorMessage(error, "Could not restore version."))
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-4xl">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>
            Every explicit user or AI save creates a version.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-[15rem_1fr] overflow-hidden rounded-xl border">
          <div className="overflow-y-auto border-r p-2">
            {versions.map((version) => (
              <button
                key={version.id}
                type="button"
                onClick={() => void inspect(version)}
                className={cn(
                  "mb-1 w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted",
                  selected?.id === version.id && "bg-muted"
                )}
              >
                <span className="font-medium">Revision {version.revision}</span>
                <span className="block text-xs text-muted-foreground capitalize">
                  {version.source} · {formatDate(version.created)}
                </span>
              </button>
            ))}
          </div>
          <pre className="overflow-auto p-5 text-sm whitespace-pre-wrap">
            {selected?.content ?? "Select a version to preview its content."}
          </pre>
        </div>
        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            disabled={!selected || selected.revision === document.revision}
            onClick={() => void restore()}
          >
            Restore this version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function projectName(projects: Project[], id: string) {
  return projects.find((project) => project.id === id)?.name ?? "Project"
}
function formatDate(value: string) {
  return value ? new Date(value).toLocaleString() : ""
}
function exportFileName(title: string) {
  return title.trim().replace(/[\\/:*?"<>|]/g, "-") || "document"
}
function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
