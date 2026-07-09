import { useEffect, useMemo, useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Archive02Icon,
  ArrowUpRightIcon,
  BookOpen01Icon,
  Delete02Icon,
  Search02Icon,
} from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import {
  READING_STATUS_META,
  useReadingStore,
  type ReadingItem,
  type ReadingStatus,
} from "@/store/reading"

const NO_PROJECT = "__none__"
const ALL = "all"

type ItemForm = {
  title: string
  url: string
  description: string
  projectId: string
  tags: string
  contentText: string
  summary: string
  keyPoints: string
  status: ReadingStatus
}

const emptyForm: ItemForm = {
  title: "",
  url: "",
  description: "",
  projectId: NO_PROJECT,
  tags: "",
  contentText: "",
  summary: "",
  keyPoints: "",
  status: "unread",
}

export function ReadingPage() {
  const [addOpen, setAddOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>(ALL)
  const [projectFilter, setProjectFilter] = useState<string>(ALL)
  const [addForm, setAddForm] = useState<ItemForm>(emptyForm)
  const [detailForm, setDetailForm] = useState<ItemForm>(emptyForm)
  const [summarizeError, setSummarizeError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ReadingItem | null>(null)

  const items = useReadingStore((s) => s.items)
  const projects = useReadingStore((s) => s.projects)
  const loading = useReadingStore((s) => s.loading)
  const saving = useReadingStore((s) => s.saving)
  const summarizing = useReadingStore((s) => s.summarizing)
  const fetchItems = useReadingStore((s) => s.fetchItems)
  const fetchProjects = useReadingStore((s) => s.fetchProjects)
  const addItem = useReadingStore((s) => s.addItem)
  const updateItem = useReadingStore((s) => s.updateItem)
  const deleteItem = useReadingStore((s) => s.deleteItem)
  const summarizeItem = useReadingStore((s) => s.summarizeItem)

  useEffect(() => {
    void fetchItems()
    void fetchProjects()
  }, [fetchItems, fetchProjects])

  const projectNames = useMemo(
    () =>
      Object.fromEntries(projects.map((project) => [project.id, project.name])),
    [projects]
  )

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return items.filter((item) => {
      if (statusFilter !== ALL && item.status !== statusFilter) return false
      if (projectFilter !== ALL && item.projectId !== projectFilter)
        return false
      if (!normalized) return true
      return [
        item.title,
        item.url,
        item.description,
        item.summary,
        ...item.tags,
        ...item.keyPoints,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalized))
    })
  }, [items, projectFilter, query, statusFilter])

  const selectedItem = items.find((item) => item.id === selectedId) ?? null

  const selectItem = (item: ReadingItem | null) => {
    setSelectedId(item?.id ?? null)
    setDetailForm(item ? toForm(item) : emptyForm)
    setSummarizeError(null)
  }

  const handleAdd = async () => {
    const item = await addItem(fromForm(addForm))
    selectItem(item)
    setAddOpen(false)
    setAddForm(emptyForm)
  }

  const handleSave = async () => {
    if (!selectedItem) return
    await updateItem(selectedItem.id, fromForm(detailForm))
  }

  const handleSummarize = async () => {
    if (!selectedItem) return
    setSummarizeError(null)
    const toastId = toast.loading(
      "正在抓取文章内容并使用默认模型生成中文总结..."
    )
    try {
      await summarizeItem(selectedItem.id)
      const next = useReadingStore
        .getState()
        .items.find((item) => item.id === selectedItem.id)
      if (next) setDetailForm(toForm(next))
      toast.success("文章已抓取并总结", { id: toastId })
    } catch (error) {
      const message = error instanceof Error ? error.message : "抓取或总结失败"
      setSummarizeError(message)
      toast.error(message, { id: toastId })
    }
  }

  const handleArchive = async (item: ReadingItem) => {
    await updateItem(item.id, { status: "archived" })
  }

  const handleDelete = async (item: ReadingItem) => {
    await deleteItem(item.id)
    if (selectedId === item.id) selectItem(null)
    setDeleteTarget(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <HugeiconsIcon
                icon={BookOpen01Icon}
                strokeWidth={2}
                className="size-4"
              />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Reading</h1>
            <span className="text-sm text-muted-foreground">
              {items.length}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Collect external references, summarize them, and reuse them as chat
            context.
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
          Add link
        </Button>
      </div>

      <div className="grid gap-6">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Library</CardTitle>
            <CardDescription>
              Filter by status, project, tags, title, or summary.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_200px]">
              <div className="relative">
                <HugeiconsIcon
                  icon={Search02Icon}
                  strokeWidth={2}
                  className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search reading items..."
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  <SelectItem value="unread">Unread</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All projects</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-hidden rounded-2xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead className="hidden xl:table-cell">
                      Summary
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Project
                    </TableHead>
                    <TableHead className="hidden md:table-cell">Tags</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-28 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-32 text-center text-muted-foreground"
                      >
                        Loading reading items...
                      </TableCell>
                    </TableRow>
                  ) : filteredItems.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-32 text-center text-muted-foreground"
                      >
                        No reading items yet. Add a link to start collecting
                        references.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredItems.map((item) => (
                      <TableRow
                        key={item.id}
                        data-state={
                          selectedItem?.id === item.id ? "selected" : undefined
                        }
                        className="cursor-pointer"
                        onClick={() => selectItem(item)}
                      >
                        <TableCell className="min-w-72 whitespace-normal">
                          <span className="font-medium">{item.title}</span>
                        </TableCell>
                        <TableCell className="hidden max-w-md whitespace-normal xl:table-cell">
                          <span
                            title={item.summary || "No summary yet"}
                            className="line-clamp-2 text-xs text-muted-foreground"
                          >
                            {item.summary || "No summary yet"}
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {item.projectId
                            ? projectNames[item.projectId] || "Unknown project"
                            : "-"}
                        </TableCell>
                        <TableCell className="hidden max-w-52 whitespace-normal md:table-cell">
                          <TagList tags={item.tags} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={item.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon-xs" asChild>
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                aria-label="Open link"
                              >
                                <HugeiconsIcon
                                  icon={ArrowUpRightIcon}
                                  strokeWidth={2}
                                />
                              </a>
                            </Button>
                            {item.status !== "archived" ? (
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void handleArchive(item)
                                }}
                                aria-label="Archive item"
                              >
                                <HugeiconsIcon
                                  icon={Archive02Icon}
                                  strokeWidth={2}
                                />
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={(event) => {
                                event.stopPropagation()
                                setDeleteTarget(item)
                              }}
                              aria-label="Delete item"
                            >
                              <HugeiconsIcon
                                icon={Delete02Icon}
                                strokeWidth={2}
                              />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Sheet
        open={selectedItem != null}
        onOpenChange={(open) => !open && selectItem(null)}
      >
        <SheetContent
          className="w-full overflow-hidden sm:!w-[48rem] sm:!max-w-3xl"
        >
          <SheetHeader className="shrink-0 border-b pr-14">
            <SheetTitle>Details</SheetTitle>
            <SheetDescription>
              Edit metadata, pasted content, and AI digest fields for the
              selected item.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            {selectedItem ? (
              <ItemFormFields
                form={detailForm}
                setForm={setDetailForm}
                projects={projects}
                summarizeError={summarizeError}
              />
            ) : null}
          </div>
          {selectedItem ? (
            <SheetFooter className="flex-row items-center justify-between gap-2 border-t bg-popover">
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(selectedItem)}
                disabled={saving || summarizing}
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                Delete
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => void handleSummarize()}
                  disabled={summarizing || saving || !detailForm.url.trim()}
                >
                  {summarizing
                    ? "Fetching and summarizing..."
                    : "Fetch and summarize"}
                </Button>
                <Button
                  onClick={() => void handleSave()}
                  disabled={
                    saving || !detailForm.title.trim() || !detailForm.url.trim()
                  }
                >
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </SheetFooter>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add reading item</DialogTitle>
            <DialogDescription>
              Save an external reference now. You can paste content and add
              summaries later.
            </DialogDescription>
          </DialogHeader>
          <ItemFormFields
            form={addForm}
            setForm={setAddForm}
            projects={projects}
            summarizeError={null}
            compact
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleAdd()}
              disabled={saving || !addForm.title.trim() || !addForm.url.trim()}
            >
              {saving ? "Adding..." : "Add link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete reading item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove "{deleteTarget?.title}" from your
              reading library. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleteTarget && void handleDelete(deleteTarget)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ItemFormFields({
  form,
  setForm,
  projects,
  summarizeError,
  compact = false,
}: {
  form: ItemForm
  setForm: (form: ItemForm) => void
  projects: { id: string; name: string }[]
  summarizeError: string | null
  compact?: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor={compact ? "add-title" : "detail-title"}>Title</Label>
        <Input
          id={compact ? "add-title" : "detail-title"}
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
          placeholder="Article, repo, product page..."
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={compact ? "add-url" : "detail-url"}>URL</Label>
        <Input
          id={compact ? "add-url" : "detail-url"}
          value={form.url}
          onChange={(event) => setForm({ ...form, url: event.target.value })}
          placeholder="https://example.com"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Project</Label>
          <Select
            value={form.projectId}
            onValueChange={(projectId) => setForm({ ...form, projectId })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="No project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PROJECT}>No project</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Status</Label>
          <Select
            value={form.status}
            onValueChange={(status) =>
              setForm({ ...form, status: status as ReadingStatus })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="read">Read</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={compact ? "add-tags" : "detail-tags"}>Tags</Label>
        <Input
          id={compact ? "add-tags" : "detail-tags"}
          value={form.tags}
          onChange={(event) => setForm({ ...form, tags: event.target.value })}
          placeholder="PocketBase, AI Agent, research"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={compact ? "add-description" : "detail-description"}>
          Description
        </Label>
        <Textarea
          id={compact ? "add-description" : "detail-description"}
          value={form.description}
          onChange={(event) =>
            setForm({ ...form, description: event.target.value })
          }
          placeholder="Why this reference matters..."
        />
      </div>
      {!compact ? (
        <>
          {summarizeError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {summarizeError}
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="detail-content">Content</Label>
            <Textarea
              id="detail-content"
              value={form.contentText}
              onChange={(event) =>
                setForm({ ...form, contentText: event.target.value })
              }
              placeholder="Paste fetched or copied article content here."
              className="min-h-32"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="detail-summary">Summary</Label>
            <Textarea
              id="detail-summary"
              value={form.summary}
              onChange={(event) =>
                setForm({ ...form, summary: event.target.value })
              }
              placeholder="AI or manual summary."
              className="min-h-28"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="detail-key-points">Key points</Label>
            <Textarea
              id="detail-key-points"
              value={form.keyPoints}
              onChange={(event) =>
                setForm({ ...form, keyPoints: event.target.value })
              }
              placeholder="One key point per line."
              className="min-h-28"
            />
          </div>
        </>
      ) : null}
    </div>
  )
}

function StatusBadge({ status }: { status: ReadingStatus }) {
  const meta = READING_STATUS_META[status]
  return <Badge variant={meta.variant}>{meta.label}</Badge>
}

function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return <span className="text-muted-foreground">-</span>
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, 3).map((tag) => (
        <Badge key={tag} variant="outline" className="max-w-28 truncate">
          {tag}
        </Badge>
      ))}
      {tags.length > 3 ? (
        <Badge variant="ghost">+{tags.length - 3}</Badge>
      ) : null}
    </div>
  )
}

function toForm(item: ReadingItem): ItemForm {
  return {
    title: item.title,
    url: item.url,
    description: item.description || "",
    projectId: item.projectId || NO_PROJECT,
    tags: item.tags.join(", "),
    contentText: item.contentText || "",
    summary: item.summary || "",
    keyPoints: item.keyPoints.join("\n"),
    status: item.status,
  }
}

function fromForm(form: ItemForm) {
  return {
    title: form.title.trim(),
    url: form.url.trim(),
    description: form.description.trim(),
    projectId: form.projectId === NO_PROJECT ? "" : form.projectId,
    tags: splitList(form.tags),
    status: form.status,
    contentText: form.contentText.trim(),
    summary: form.summary.trim(),
    keyPoints: splitLines(form.keyPoints),
  }
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
}
