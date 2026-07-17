import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Brain02Icon,
  Delete02Icon,
  Edit01Icon,
  Link02Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"

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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { workspaceRecordUrl } from "@/lib/workspace-navigation"
import {
  useMemoriesStore,
  type ChatMemory,
  type MemoryCategory,
} from "@/store/memories"
import { usePreferencesStore } from "@/store/preferences"

const CATEGORY_OPTIONS: Array<{
  value: MemoryCategory
  label: string
}> = [
  { value: "preference", label: "Preference" },
  { value: "personal", label: "Personal" },
  { value: "work", label: "Work" },
  { value: "goal", label: "Goal" },
  { value: "constraint", label: "Constraint" },
]

const ORIGIN_LABELS = {
  manual: "Added manually",
  explicit: "Saved as requested",
  automatic: "Saved automatically",
}

export function MemorySettingsCard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const preferences = usePreferencesStore((state) => state.preferences)
  const updateMemoryEnabled = usePreferencesStore(
    (state) => state.updateMemoryEnabled
  )
  const updateMemoryAutoCapture = usePreferencesStore(
    (state) => state.updateMemoryAutoCapture
  )
  const memories = useMemoriesStore((state) => state.memories)
  const initializeMemories = useMemoriesStore((state) => state.initialize)
  const [managerOpen, setManagerOpen] = useState(
    () => searchParams.get("manage") === "memory"
  )

  useEffect(() => {
    void initializeMemories()
  }, [initializeMemories])

  const changeManagerOpen = (open: boolean) => {
    setManagerOpen(open)
    if (!open && searchParams.get("manage") === "memory") {
      const next = new URLSearchParams(searchParams)
      next.delete("manage")
      setSearchParams(next, { replace: true })
    }
  }

  const updateEnabled = async (checked: boolean) => {
    try {
      await updateMemoryEnabled(checked)
    } catch {
      toast.error("Could not update Chat memory")
    }
  }

  const updateAutomatic = async (checked: boolean) => {
    try {
      await updateMemoryAutoCapture(checked)
    } catch {
      toast.error("Could not update automatic memory")
    }
  }

  const enabled = preferences?.memoryEnabled ?? false
  const automatic = preferences?.memoryAutoCapture ?? false

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <HugeiconsIcon
                icon={Brain02Icon}
                strokeWidth={2}
                className="size-4"
              />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle>Memory</CardTitle>
              <CardDescription>
                Control what Chat can remember across conversations.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setManagerOpen(true)}
            >
              Manage memories
              <Badge variant="secondary">{memories.length}</Badge>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <PreferenceToggle
            id="memory-enabled"
            label="Use memory in Chat"
            description="Allow Chat to use and save information across conversations."
            checked={enabled}
            onCheckedChange={(checked) => void updateEnabled(checked)}
            disabled={!preferences}
          />
          <PreferenceToggle
            id="memory-auto-capture"
            label="Automatically save useful details"
            description="When off, Chat saves a memory only when you explicitly ask."
            checked={automatic}
            onCheckedChange={(checked) => void updateAutomatic(checked)}
            disabled={!preferences || !enabled}
          />
        </CardContent>
      </Card>

      <MemoryManagerSheet open={managerOpen} onOpenChange={changeManagerOpen} />
    </>
  )
}

function PreferenceToggle({
  id,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  disabled: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  )
}

function MemoryManagerSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const memories = useMemoriesStore((state) => state.memories)
  const loading = useMemoriesStore((state) => state.loading)
  const error = useMemoriesStore((state) => state.error)
  const initialize = useMemoriesStore((state) => state.initialize)
  const add = useMemoriesStore((state) => state.add)
  const update = useMemoriesStore((state) => state.update)
  const remove = useMemoriesStore((state) => state.remove)
  const clearAll = useMemoriesStore((state) => state.clearAll)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<"all" | MemoryCategory>("all")
  const [editing, setEditing] = useState<ChatMemory | "new" | null>(null)
  const [category, setCategory] = useState<MemoryCategory>("preference")
  const [content, setContent] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ChatMemory | "all" | null>(
    null
  )
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (open) void initialize(true)
  }, [initialize, open])

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return memories.filter((memory) => {
      if (filter !== "all" && memory.category !== filter) return false
      return (
        !normalized ||
        memory.content.toLowerCase().includes(normalized) ||
        memory.category.includes(normalized)
      )
    })
  }, [filter, memories, query])

  const beginNew = () => {
    setEditing("new")
    setCategory("preference")
    setContent("")
  }

  const beginEdit = (memory: ChatMemory) => {
    setEditing(memory)
    setCategory(memory.category)
    setContent(memory.content)
  }

  const saveMemory = async () => {
    if (!content.trim()) return
    setSaving(true)
    try {
      if (editing === "new") {
        await add({ category, content })
        toast.success("Memory added")
      } else if (editing) {
        await update(editing.id, { category, content })
        toast.success("Memory updated")
      }
      setEditing(null)
    } catch (saveError) {
      toast.error(
        saveError instanceof Error ? saveError.message : "Could not save memory"
      )
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      if (deleteTarget === "all") {
        const count = await clearAll()
        toast.success(`Deleted ${count} memories`)
      } else {
        await remove(deleteTarget.id)
        toast.success("Memory deleted")
      }
      setDeleteTarget(null)
    } catch (deleteError) {
      toast.error(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete memory"
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl!">
          <SheetHeader>
            <SheetTitle>Manage memories</SheetTitle>
            <SheetDescription>
              Add and control the personal context available to Chat. Maximum 50
              memories.
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 pb-6">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <HugeiconsIcon
                  icon={Search01Icon}
                  strokeWidth={2}
                  className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search memories..."
                  className="pl-9"
                />
              </div>
              <Select
                value={filter}
                onValueChange={(value) =>
                  setFilter(value as "all" | MemoryCategory)
                }
              >
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={beginNew} disabled={memories.length >= 50}>
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                Add memory
              </Button>
            </div>

            {editing && (
              <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">
                    {editing === "new" ? "New memory" : "Edit memory"}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Category</Label>
                  <Select
                    value={category}
                    onValueChange={(value) =>
                      setCategory(value as MemoryCategory)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Memory</Label>
                  <Textarea
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    maxLength={500}
                    placeholder="One concise, durable fact..."
                    className="min-h-24"
                  />
                  <span className="self-end text-xs text-muted-foreground">
                    {content.length}/500
                  </span>
                </div>
                <Button
                  className="self-end"
                  onClick={() => void saveMemory()}
                  disabled={saving || !content.trim()}
                >
                  {saving ? "Saving..." : "Save memory"}
                </Button>
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex h-40 items-center justify-center">
                  <Spinner className="size-5" />
                </div>
              ) : visible.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                  <HugeiconsIcon
                    icon={Brain02Icon}
                    strokeWidth={2}
                    className="size-6 text-muted-foreground"
                  />
                  <p className="text-sm font-medium">No memories found</p>
                  <p className="text-xs text-muted-foreground">
                    Add a memory here or ask Chat to remember something.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 pb-2">
                  {visible.map((memory) => (
                    <MemoryRow
                      key={memory.id}
                      memory={memory}
                      onEdit={() => beginEdit(memory)}
                      onDelete={() => setDeleteTarget(memory)}
                      onToggle={(active) =>
                        void update(memory.id, { active }).catch(
                          (toggleError) =>
                            toast.error(
                              toggleError instanceof Error
                                ? toggleError.message
                                : "Could not update memory"
                            )
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            {memories.length > 0 && (
              <div className="flex items-center justify-between border-t pt-4">
                <span className="text-xs text-muted-foreground">
                  {memories.length} of 50 memories
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget("all")}
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  Delete all
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !deleting) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget === "all"
                ? "Delete all memories?"
                : "Delete memory?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget === "all"
                ? "Every saved Chat memory will be permanently removed."
                : "This memory will be permanently removed and will no longer be available to Chat."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault()
                void confirmDelete()
              }}
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function MemoryRow({
  memory,
  onEdit,
  onDelete,
  onToggle,
}: {
  memory: ChatMemory
  onEdit: () => void
  onDelete: () => void
  onToggle: (active: boolean) => void
}) {
  const category = CATEGORY_OPTIONS.find(
    (option) => option.value === memory.category
  )
  return (
    <div className="flex gap-3 rounded-xl border p-4">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{category?.label}</Badge>
          <span className="text-xs text-muted-foreground">
            {ORIGIN_LABELS[memory.origin]}
          </span>
          <span className="text-xs text-muted-foreground/70">
            {new Date(memory.updated).toLocaleDateString()}
          </span>
        </div>
        <p className="text-sm whitespace-pre-wrap">{memory.content}</p>
        {memory.sourceConversation && (
          <a
            href={workspaceRecordUrl("chat", memory.sourceConversation)}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <HugeiconsIcon icon={Link02Icon} strokeWidth={2} />
            Source conversation
          </a>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1">
        <Switch
          size="sm"
          checked={memory.active}
          onCheckedChange={onToggle}
          aria-label={memory.active ? "Deactivate memory" : "Activate memory"}
        />
        <Button variant="ghost" size="icon-sm" onClick={onEdit}>
          <HugeiconsIcon icon={Edit01Icon} strokeWidth={2} />
          <span className="sr-only">Edit memory</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
          <span className="sr-only">Delete memory</span>
        </Button>
      </div>
    </div>
  )
}
