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
  Edit02Icon,
  File02Icon,
  FloppyDiskIcon,
  FolderTransferIcon,
  Folder01Icon,
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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { htmlPreviewSrcDoc } from "@/lib/html-preview"
import { pb } from "@/lib/pocketbase"
import { cn } from "@/lib/utils"
import { requestedRecordId } from "@/lib/workspace-navigation"

type DocKind = "markdown" | "html"

type DocRecord = RecordModel & {
  title: string
  kind: DocKind
  content: string
  owner: string
  project: string
  folder: string
  status: "draft" | "archived"
  revision: number
  last_edited_by: string
  updated: string
}

type DocumentListRecord = RecordModel & {
  title: string
  kind: DocKind
  owner: string
  project: string
  folder: string
  revision: number
}

type ArchivedDocumentListRecord = RecordModel & {
  title: string
  owner: string
  project: string
  folder: string
  revision: number
}

type PinnedDocumentSummary = {
  id: string
  title: string
  kind: DocKind
  ownerId: string
  projectId?: string
  folderId?: string
  folderName?: string
  revision: number
}

type DocumentResult = {
  id: string
  title: string
  kind: DocKind
  content: string
  ownerId: string
  projectId?: string
  projectName?: string
  folderId?: string
  folderName?: string
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
type ProjectRecord = RecordModel & {
  name: string
  owner: string
  archived: boolean
}
type ProjectPreferenceRecord = RecordModel & {
  project: string
  sort_order: number
  expand?: { project?: ProjectRecord }
}
type DocFolder = RecordModel & { name: string; owner: string }
type DocsView =
  | { type: "recent" | "pinned" | "my" }
  | { type: "folder" | "project"; id: string }

const DOCS_PAGE_SIZE = 15

export function DocsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedDocId = requestedRecordId(searchParams)
  const [view, setView] = useState<DocsView>(() =>
    docsViewFromParams(searchParams)
  )
  const [documents, setDocuments] = useState<DocumentListRecord[]>([])
  const [pinnedDocuments, setPinnedDocuments] = useState<
    PinnedDocumentSummary[]
  >([])
  const [projects, setProjects] = useState<Project[]>([])
  const [editableProjects, setEditableProjects] = useState<Project[]>([])
  const [folders, setFolders] = useState<DocFolder[]>([])
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
  const [folderEditorOpen, setFolderEditorOpen] = useState(false)
  const [editingFolder, setEditingFolder] = useState<DocFolder | null>(null)
  const [editorMode, setEditorMode] = useState<DocumentEditorMode>("rich-text")
  const [htmlMode, setHtmlMode] = useState<"preview" | "source">("preview")
  const [fullscreen, setFullscreen] = useState(false)
  const editorAreaRef = useRef<HTMLElement>(null)
  const autoSelectFirstDocument = useRef(true)

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
      const directoryView = isDirectoryView(view)
      const normalizedQuery = query.trim()
      const escapedQuery = normalizedQuery.replaceAll('"', '\\"')
      const pinnedPath = normalizedQuery
        ? `/api/docs-pinned?query=${encodeURIComponent(normalizedQuery)}`
        : "/api/docs-pinned"
      const filters = ['status = "draft"']
      if (escapedQuery) {
        filters.push(
          `(title ~ "${escapedQuery}" || content ~ "${escapedQuery}")`
        )
      }
      if (view.type === "my") {
        filters.push('project = ""', 'folder = ""')
      } else if (view.type === "folder") {
        filters.push('project = ""', `folder = "${view.id}"`)
      } else if (view.type === "project") {
        filters.push(`project = "${view.id}"`)
      }
      const [allPinned, projectPreferences, memberships, folderRecords] =
        await Promise.all([
          pb.send<PinnedDocumentSummary[]>(pinnedPath, {}),
          actorId
            ? pb
                .collection("board_project_preferences")
                .getFullList<ProjectPreferenceRecord>({
                  filter: pb.filter(
                    "user = {:user} && project.archived = false",
                    { user: actorId }
                  ),
                  sort: "sort_order,id",
                  expand: "project",
                })
            : Promise.resolve([]),
          actorId
            ? pb
                .collection("board_project_members")
                .getFullList<RecordModel & { project: string; role: string }>({
                  filter: `user = "${actorId}"`,
                })
            : Promise.resolve([]),
          pb.collection("doc_folders").getFullList<DocFolder>({ sort: "name" }),
        ])
      const projectRecords = projectPreferences.flatMap((preference) => {
        const project = preference.expand?.project
        return project ? [project] : []
      })
      let listedDocuments: DocumentListRecord[] = []
      let listedTotalItems = 0
      let listedTotalPages = 1
      if (view.type !== "pinned") {
        const docResult = await pb
          .collection("docs")
          .getList<DocumentListRecord>(
            view.type === "recent" ? 1 : targetPage,
            view.type === "recent" ? 10 : DOCS_PAGE_SIZE,
            {
              sort: "-updated",
              filter: filters.join(" && "),
              fields: "id,title,kind,owner,project,folder,revision",
            }
          )
        listedDocuments = docResult.items
        listedTotalItems = docResult.totalItems
        listedTotalPages = docResult.totalPages
      }
      const editableMemberships = new Set(
        memberships
          .filter((membership) => membership.role !== "viewer")
          .map((membership) => membership.project)
      )
      setPinnedDocuments(allPinned)
      setDocuments(listedDocuments)
      setTotalPages(directoryView ? Math.max(1, listedTotalPages) : 1)
      setTotalItems(
        view.type === "pinned"
          ? allPinned.length
          : view.type === "recent"
            ? listedDocuments.length
            : listedTotalItems
      )
      setProjects(projectRecords.map(({ id, name }) => ({ id, name })))
      setFolders(folderRecords)
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
        if (!autoSelectFirstDocument.current) return null
        return view.type === "pinned"
          ? (allPinned[0]?.id ?? null)
          : (listedDocuments[0]?.id ?? null)
      })
    },
    [page, query, view]
  )

  // Selection can change while a document fetch is in flight (URL sync and
  // selection updates land in separate commits, so switching briefly ping-pongs
  // through the previous document). Only the newest load may apply its result;
  // a stale response must never overwrite the document loaded after it.
  const loadDocumentSeq = useRef(0)
  const dismissedRequestedDocId = useRef<string | null>(null)
  const loadDocument = useCallback(
    async (id: string) => {
      const seq = ++loadDocumentSeq.current
      const record = await pb.collection("docs").getOne<DocRecord>(id)
      const [project, folder] = await Promise.all([
        record.project
          ? pb
              .collection("board_projects")
              .getOne<RecordModel & { name: string }>(record.project)
              .catch(() => null)
          : Promise.resolve(null),
        record.folder
          ? pb
              .collection("doc_folders")
              .getOne<DocFolder>(record.folder)
              .catch(() => null)
          : Promise.resolve(null),
      ])
      if (seq !== loadDocumentSeq.current) return
      const doc: DocumentResult = {
        id: record.id,
        title: record.title,
        kind: record.kind === "html" ? "html" : "markdown",
        content: record.content,
        ownerId: record.owner,
        projectId: record.project || undefined,
        projectName: project?.name,
        folderId: record.folder || undefined,
        folderName: folder?.name,
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
      if (requestedDocId === id && !searchParams.get("view")) {
        const nextView = viewForDocument(doc)
        setView(nextView)
        navigate(docsPageUrl(nextView, id), { replace: true })
      }
    },
    [navigate, requestedDocId, searchParams]
  )

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
    if (!requestedDocId) {
      dismissedRequestedDocId.current = null
      return
    }
    if (requestedDocId === dismissedRequestedDocId.current) return
    if (!requestedDocId || requestedDocId === selectedId) return
    if (dirty && !window.confirm("Discard your unsaved changes?")) {
      if (selectedId) {
        navigate(docsPageUrl(view, selectedId), { replace: true })
      }
      return
    }
    void Promise.resolve().then(() => setSelectedId(requestedDocId))
  }, [dirty, navigate, requestedDocId, selectedId, view])

  useEffect(() => {
    if (!requestedDocId && selectedId) {
      navigate(docsPageUrl(view, selectedId), { replace: true })
    }
  }, [navigate, requestedDocId, selectedId, view])

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
          navigate(docsPageUrl(view), { replace: true })
        }
      })
  }, [loadDocument, navigate, requestedDocId, selectedId, view])

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
    autoSelectFirstDocument.current = true
    setSelectedId(id)
    navigate(docsPageUrl(view, id), { replace: true })
  }

  const selectView = (next: DocsView) => {
    if (sameDocsView(view, next)) return
    if (dirty && !window.confirm("Discard your unsaved changes?")) return
    autoSelectFirstDocument.current = false
    loadDocumentSeq.current++
    dismissedRequestedDocId.current = selectedId
    setLoading(true)
    setView(next)
    setPage(1)
    setSelectedId(null)
    setPersisted(null)
    setDraftTitle("")
    setDraftContent("")
    navigate(docsPageUrl(next), { replace: true })
  }

  const editFolder = (folder?: DocFolder) => {
    setEditingFolder(folder ?? null)
    setFolderEditorOpen(true)
  }

  const deleteFolder = async (folder: DocFolder) => {
    try {
      await pb.collection("doc_folders").delete(folder.id)
      if (view.type === "folder" && view.id === folder.id) {
        const nextView: DocsView = { type: "my" }
        autoSelectFirstDocument.current = false
        loadDocumentSeq.current++
        dismissedRequestedDocId.current = selectedId
        setLoading(true)
        setView(nextView)
        setPage(1)
        setSelectedId(null)
        setPersisted(null)
        setDraftTitle("")
        setDraftContent("")
        navigate(docsPageUrl(nextView), { replace: true })
      } else {
        await loadList()
      }
      toast.success("Folder deleted. Its documents are now in My documents.")
    } catch (error) {
      toast.error(extractErrorMessage(error, "Could not delete folder."))
    }
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
        autoSelectFirstDocument.current = false
        loadDocumentSeq.current++
        dismissedRequestedDocId.current = id
        setSelectedId(null)
        setPersisted(null)
        setDraftTitle("")
        setDraftContent("")
        navigate(docsPageUrl(view), { replace: true })
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
        autoSelectFirstDocument.current = false
        loadDocumentSeq.current++
        dismissedRequestedDocId.current = id
        setSelectedId(null)
        setPersisted(null)
        setDraftTitle("")
        setDraftContent("")
        navigate(docsPageUrl(view), { replace: true })
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
        <div className="shrink-0 border-b">
          <LocationNavigation
            view={view}
            folders={folders}
            projects={projects}
            onSelect={selectView}
            onCreateFolder={() => editFolder()}
            onEditFolder={editFolder}
            onDeleteFolder={deleteFolder}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : pinnedDocuments.length === 0 && documents.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              No documents in this location.
            </p>
          ) : (
            <div className="space-y-3">
              {view.type === "pinned" && (
                <DocumentGroup
                  documents={pinnedDocuments.map((doc) => ({
                    id: doc.id,
                    title: doc.title,
                    kind: doc.kind,
                    owner: doc.ownerId,
                    project: doc.projectId ?? "",
                    folder: doc.folderId ?? "",
                    revision: doc.revision,
                    pinned: true,
                  }))}
                  selectedId={selectedId}
                  projects={projects}
                  folders={folders}
                  onSelect={selectDocument}
                  onTogglePin={togglePin}
                  onArchive={archiveDocument}
                  onDelete={deleteDocument}
                />
              )}
              {view.type !== "pinned" && (
                <DocumentGroup
                  label={
                    view.type === "recent"
                      ? undefined
                      : docsViewLabel(view, folders, projects)
                  }
                  documents={documents.map((doc) => ({
                    id: doc.id,
                    title: doc.title,
                    kind: doc.kind,
                    owner: doc.owner,
                    project: doc.project,
                    folder: doc.folder,
                    revision: doc.revision,
                    pinned: pinnedDocuments.some((pin) => pin.id === doc.id),
                  }))}
                  selectedId={selectedId}
                  projects={projects}
                  folders={folders}
                  onSelect={selectDocument}
                  onTogglePin={togglePin}
                  onArchive={archiveDocument}
                  onDelete={deleteDocument}
                />
              )}
            </div>
          )}
        </div>
        {!loading && isDirectoryView(view) && totalPages > 0 && (
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
                  <MoveDocumentButton
                    document={persisted}
                    folders={folders}
                    projects={editableProjects}
                    disabled={dirty}
                    onMoved={(nextView) => {
                      setLoading(true)
                      setView(nextView)
                      setPage(1)
                      setPersisted((current) =>
                        current
                          ? {
                              ...current,
                              projectId:
                                nextView.type === "project"
                                  ? nextView.id
                                  : undefined,
                              projectName:
                                nextView.type === "project"
                                  ? projectName(projects, nextView.id)
                                  : undefined,
                              folderId:
                                nextView.type === "folder"
                                  ? nextView.id
                                  : undefined,
                              folderName:
                                nextView.type === "folder"
                                  ? folderName(folders, nextView.id)
                                  : undefined,
                            }
                          : current
                      )
                      navigate(docsPageUrl(nextView, persisted.id), {
                        replace: true,
                      })
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
                          <HugeiconsIcon
                            icon={Download01Icon}
                            strokeWidth={2}
                          />
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
                    This document is empty. Edit the HTML source to add content.
                  </p>
                </div>
              ) : (
                // srcdoc + sandbox without allow-same-origin runs the document
                // in an opaque origin: scripts work but can never reach the
                // parent page or its PocketBase session.
                <iframe
                  key={persisted.id}
                  title={`${draftTitle || "HTML document"} preview`}
                  srcDoc={htmlPreviewSrcDoc(draftContent)}
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
            <p className="text-sm">Select a document to view its content.</p>
          </div>
        )}
      </main>

      <CreateDocumentDialog
        key={`${createOpen}:${defaultLocationForView(view, editableProjects)}`}
        open={createOpen}
        onOpenChange={setCreateOpen}
        projects={editableProjects}
        folders={folders}
        defaultLocation={defaultLocationForView(view, editableProjects)}
        onCreated={async (doc) => {
          setPage(1)
          await loadList(1)
          setSelectedId(doc.id)
          const nextView = viewForDocument(doc)
          setView(nextView)
          navigate(docsPageUrl(nextView, doc.id), { replace: true })
        }}
      />
      <FolderEditorDialog
        key={`${folderEditorOpen}:${editingFolder?.id ?? "new"}`}
        open={folderEditorOpen}
        onOpenChange={setFolderEditorOpen}
        folder={editingFolder}
        onSaved={async (folder) => {
          await loadList()
          selectView({ type: "folder", id: folder.id })
        }}
      />
      <ArchivedDocumentsDialog
        open={archivedOpen}
        onOpenChange={setArchivedOpen}
        folders={folders}
        projects={projects}
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
  folder: string
  revision: number
  pinned: boolean
}

function LocationNavigation({
  view,
  folders,
  projects,
  onSelect,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
}: {
  view: DocsView
  folders: DocFolder[]
  projects: Project[]
  onSelect: (view: DocsView) => void
  onCreateFolder: () => void
  onEditFolder: (folder: DocFolder) => void
  onDeleteFolder: (folder: DocFolder) => Promise<void>
}) {
  const selectedFolder =
    view.type === "folder"
      ? folders.find((folder) => folder.id === view.id)
      : undefined
  const locationValue =
    view.type === "my"
      ? "my_documents"
      : view.type === "folder" || view.type === "project"
        ? `${view.type}:${view.id}`
        : ""

  return (
    <nav className="space-y-2 p-2" aria-label="Document locations">
      <div className="grid grid-cols-3 gap-1">
        <QuickViewButton
          label="Pinned"
          icon={Pin02Icon}
          active={view.type === "pinned"}
          onClick={() => onSelect({ type: "pinned" })}
        />
        <QuickViewButton
          label="Recent"
          icon={File02Icon}
          active={view.type === "recent"}
          onClick={() => onSelect({ type: "recent" })}
        />
        <QuickViewButton
          label="Locations"
          icon={Folder01Icon}
          active={isDirectoryView(view)}
          onClick={() => {
            if (!isDirectoryView(view)) onSelect({ type: "my" })
          }}
        />
      </div>
      {isDirectoryView(view) && (
        <div className="flex items-center gap-1">
          <Select
            value={locationValue}
            onValueChange={(value) => onSelect(viewForLocationValue(value))}
          >
            <SelectTrigger
              size="sm"
              className="min-w-0 flex-1 rounded-lg bg-background"
              aria-label="Choose document location"
            >
              <SelectValue placeholder="Choose location" />
            </SelectTrigger>
            <SelectContent
              position="popper"
              align="start"
              className="max-h-72"
            >
              <SelectGroup>
                <SelectLabel>My documents</SelectLabel>
                <SelectItem value="my_documents">
                  <HugeiconsIcon icon={Folder01Icon} strokeWidth={2} />
                  Root
                </SelectItem>
                {folders.map((folder) => (
                  <SelectItem
                    key={folder.id}
                    value={`folder:${folder.id}`}
                    className="pl-6"
                  >
                    <HugeiconsIcon icon={Folder01Icon} strokeWidth={2} />
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectGroup>
              {projects.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Projects</SelectLabel>
                  {projects.map((project) => (
                    <SelectItem
                      key={project.id}
                      value={`project:${project.id}`}
                      className="pl-6"
                    >
                      <HugeiconsIcon icon={Folder01Icon} strokeWidth={2} />
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="New folder"
            onClick={onCreateFolder}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          </Button>
          {selectedFolder && (
            <FolderActionsButton
              folder={selectedFolder}
              onEdit={() => onEditFolder(selectedFolder)}
              onDelete={() => onDeleteFolder(selectedFolder)}
            />
          )}
        </div>
      )}
    </nav>
  )
}

function QuickViewButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"]
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-0 items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-xs hover:bg-muted/60",
        active && "bg-muted font-medium"
      )}
    >
      <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}

function FolderActionsButton({
  folder,
  onEdit,
  onDelete,
}: {
  folder: DocFolder
  onEdit: () => void
  onDelete: () => Promise<void>
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${folder.name} actions`}
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              “{folder.name}” will be deleted. Its documents will move to My
              documents and will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void onDelete()}>
              Delete folder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function DocumentGroup({
  label,
  documents,
  selectedId,
  projects,
  folders,
  onSelect,
  onTogglePin,
  onArchive,
  onDelete,
}: {
  label?: string
  documents: DocumentListEntry[]
  selectedId: string | null
  projects: Project[]
  folders: DocFolder[]
  onSelect: (id: string) => void
  onTogglePin: (id: string, pinned: boolean) => Promise<void>
  onArchive: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  if (documents.length === 0) return null
  return (
    <section>
      {label && (
        <p className="px-3 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
      )}
      <div className="space-y-1">
        {documents.map((doc) => (
          <DocumentListItem
            key={doc.id}
            document={doc}
            active={selectedId === doc.id}
            projectName={
              doc.project
                ? projectName(projects, doc.project)
                : doc.folder
                  ? folderName(folders, doc.folder)
                  : "My documents"
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
  folders,
  projects,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  folders: DocFolder[]
  projects: Project[]
  onChanged: () => Promise<void>
}) {
  const [items, setItems] = useState<ArchivedDocumentListRecord[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] =
    useState<ArchivedDocumentListRecord | null>(null)

  const load = useCallback(async () => {
    const result = await pb
      .collection("docs")
      .getList<ArchivedDocumentListRecord>(page, 10, {
        filter: 'status = "archived"',
        sort: "-updated",
        fields: "id,title,owner,project,folder,revision",
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
                        {doc.project
                          ? projectName(projects, doc.project)
                          : doc.folder
                            ? folderName(folders, doc.folder)
                            : "My documents"}{" "}
                        · Revision {doc.revision}
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

function FolderEditorDialog({
  open,
  onOpenChange,
  folder,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  folder: DocFolder | null
  onSaved: (folder: DocFolder) => Promise<void>
}) {
  const [name, setName] = useState(folder?.name ?? "")
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const result = folder
        ? await pb
            .collection("doc_folders")
            .update<DocFolder>(folder.id, { name })
        : await pb.collection("doc_folders").create<DocFolder>({ name })
      await onSaved(result)
      onOpenChange(false)
      toast.success(folder ? "Folder renamed." : "Folder created.")
    } catch (error) {
      toast.error(extractErrorMessage(error, "Could not save folder."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{folder ? "Rename folder" : "New folder"}</DialogTitle>
          <DialogDescription>
            Personal folders organize documents inside My documents.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="folder-name">Name</Label>
          <Input
            id="folder-name"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save()
            }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!name.trim() || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreateDocumentDialog({
  open,
  onOpenChange,
  projects,
  folders,
  defaultLocation,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: Project[]
  folders: DocFolder[]
  defaultLocation: string
  onCreated: (doc: DocumentResult) => Promise<void>
}) {
  const [title, setTitle] = useState("")
  const [kind, setKind] = useState<DocKind>("markdown")
  const [location, setLocation] = useState(defaultLocation)
  const [saving, setSaving] = useState(false)

  const create = async () => {
    setSaving(true)
    try {
      const [locationType, locationId = ""] = location.split(":")
      const doc = await pb.send<DocumentResult>("/api/docs", {
        method: "POST",
        body: {
          title,
          kind,
          content: "",
          folderId: locationType === "folder" ? locationId : "",
          projectId: locationType === "project" ? locationId : "",
        },
      })
      await onCreated(doc)
      setTitle("")
      setKind("markdown")
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
            Choose where this document should live.
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
          <div className="space-y-2">
            <Label>Location</Label>
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="my_documents">My documents</SelectItem>
                {folders.map((folder) => (
                  <SelectItem key={folder.id} value={`folder:${folder.id}`}>
                    My documents / {folder.name}
                  </SelectItem>
                ))}
                {projects.map((project) => (
                  <SelectItem key={project.id} value={`project:${project.id}`}>
                    Project / {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Personal locations are private. Project documents are shared with
              that project's members.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!title.trim() || saving}
            onClick={() => void create()}
          >
            {saving ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MoveDocumentButton({
  document,
  projects,
  folders,
  disabled,
  onMoved,
}: {
  document: DocumentResult
  projects: Project[]
  folders: DocFolder[]
  disabled: boolean
  onMoved: (view: DocsView) => void
}) {
  const [open, setOpen] = useState(false)
  const [location, setLocation] = useState(
    document.folderId ? `folder:${document.folderId}` : "my_documents"
  )
  const move = async () => {
    try {
      const [locationType, locationId = ""] = location.split(":")
      let nextView: DocsView
      if (locationType === "project") {
        const moved = await pb.send<DocumentResult>(
          `/api/docs/${document.id}/move-to-project`,
          {
            method: "POST",
            body: { projectId: locationId },
          }
        )
        nextView = viewForDocument(moved)
      } else {
        const moved = await pb.collection("docs").update<DocRecord>(document.id, {
          folder: locationType === "folder" ? locationId : "",
        })
        nextView = moved.folder
          ? { type: "folder", id: moved.folder }
          : { type: "my" }
      }
      onMoved(nextView)
      setOpen(false)
      toast.success("Document moved.")
    } catch (error) {
      toast.error(extractErrorMessage(error, "Could not move document."))
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <HeaderIconButton
        label="Move document"
        icon={FolderTransferIcon}
        disabled={disabled}
        onClick={() => {
          setLocation(
            document.folderId
              ? `folder:${document.folderId}`
              : "my_documents"
          )
          setOpen(true)
        }}
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move document</DialogTitle>
          <DialogDescription>
            Moving to a project shares the document with project members and
            cannot be undone in this version.
          </DialogDescription>
        </DialogHeader>
        <Select value={location} onValueChange={setLocation}>
          <SelectTrigger>
            <SelectValue placeholder="Select location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="my_documents">My documents</SelectItem>
            {folders.map((folder) => (
              <SelectItem key={folder.id} value={`folder:${folder.id}`}>
                My documents / {folder.name}
              </SelectItem>
            ))}
            {projects.map((project) => (
              <SelectItem key={project.id} value={`project:${project.id}`}>
                Project / {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => void move()}>Move</Button>
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
function folderName(folders: DocFolder[], id: string) {
  return folders.find((folder) => folder.id === id)?.name ?? "Folder"
}
function docsViewFromParams(searchParams: URLSearchParams): DocsView {
  const type = searchParams.get("view")
  const id = searchParams.get("location")?.trim() ?? ""
  if ((type === "folder" || type === "project") && id) return { type, id }
  if (type === "pinned" || type === "my") return { type }
  return { type: "recent" }
}
function docsPageUrl(view: DocsView, recordId?: string) {
  const params = new URLSearchParams({ view: view.type })
  if (view.type === "folder" || view.type === "project") {
    params.set("location", view.id)
  }
  if (recordId) params.set("open", recordId)
  return `/docs?${params.toString()}`
}
function sameDocsView(left: DocsView, right: DocsView) {
  return (
    left.type === right.type &&
    (!("id" in left) || !("id" in right) || left.id === right.id)
  )
}
function isDirectoryView(view: DocsView) {
  return (
    view.type === "my" || view.type === "folder" || view.type === "project"
  )
}
function viewForDocument(doc: DocumentResult): DocsView {
  if (doc.projectId) return { type: "project", id: doc.projectId }
  if (doc.folderId) return { type: "folder", id: doc.folderId }
  return { type: "my" }
}
function defaultLocationForView(view: DocsView, editableProjects: Project[]) {
  if (view.type === "folder") return `folder:${view.id}`
  if (
    view.type === "project" &&
    editableProjects.some((project) => project.id === view.id)
  ) {
    return `project:${view.id}`
  }
  return "my_documents"
}
function viewForLocationValue(value: string): DocsView {
  const [type, id = ""] = value.split(":")
  if (type === "folder" && id) return { type: "folder", id }
  if (type === "project" && id) return { type: "project", id }
  return { type: "my" }
}
function docsViewLabel(
  view: DocsView,
  folders: DocFolder[],
  projects: Project[]
) {
  if (view.type === "my") return "My documents"
  if (view.type === "folder") return folderName(folders, view.id)
  if (view.type === "project") return projectName(projects, view.id)
  return "Recent"
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
