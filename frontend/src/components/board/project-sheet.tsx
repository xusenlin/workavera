import { useEffect, useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Delete02Icon,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ColorPicker } from "@/components/ui/color-picker"
import { Input } from "@/components/ui/input"
import { Label as FieldLabel } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { ProjectActivity } from "./project-activity"
import {
  STATE_CATEGORY_META,
  useBoardStore,
  type BoardTemplate,
  type MemberRole,
  type Project,
  type StateCategory,
} from "@/store/board"
import { pb } from "@/lib/pocketbase"
import { useAuthStore, type User } from "@/store/auth"

type ProjectSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project | null
}

// ---- Draft types for the add-mode local form ----

type StateDraft = {
  id: string
  name: string
  color: string
  category: StateCategory
}

type LabelDraft = {
  id: string
  name: string
  color: string
}

type MemberDraft = {
  id: string
  userId: string
  name: string
  avatar?: string
  role: MemberRole
}

const emptyStateDraft: StateDraft = {
  id: "",
  name: "",
  color: "#64748b",
  category: "pending",
}

const emptyLabelDraft: LabelDraft = {
  id: "",
  name: "",
  color: "#64748b",
}

const BLANK_TEMPLATE = "blank"

const emptyDrafts = { states: [] as StateDraft[], labels: [] as LabelDraft[] }

function templateToDrafts(
  id: string,
  templates: BoardTemplate[]
): { states: StateDraft[]; labels: LabelDraft[] } {
  if (id === BLANK_TEMPLATE) return emptyDrafts
  const template = templates.find((t) => t.id === id)
  if (!template) return emptyDrafts
  return {
    states: template.states.map((s, i) => ({
      id: `draft-state-${i}`,
      name: s.name,
      color: s.color,
      category: s.category,
    })),
    labels: template.labels.map((l, i) => ({
      id: `draft-label-${i}`,
      name: l.name,
      color: l.color,
    })),
  }
}

type UserOption = { id: string; name: string; avatar?: string }

function OwnerSection({
  project,
  currentUser,
  onTransferred,
}: {
  project: Project | null
  currentUser: User | null
  onTransferred: () => void
}) {
  const transferProjectOwner = useBoardStore((s) => s.transferProjectOwner)
  const [userOptions, setUserOptions] = useState<UserOption[]>([])
  const [selectedUserId, setSelectedUserId] = useState("")
  const [confirmTransfer, setConfirmTransfer] = useState(false)
  const [transferring, setTransferring] = useState(false)

  useEffect(() => {
    if (project) void loadUsers(setUserOptions)
  }, [project])

  const owner = project
    ? {
        id: project.ownerId,
        name: project.ownerName,
        avatar: project.ownerAvatar,
      }
    : currentUser
  const transferTargets = project
    ? userOptions.filter((user) => user.id !== project.ownerId)
    : []
  const selectedUser = transferTargets.find(
    (user) => user.id === selectedUserId
  )

  const handleTransfer = async () => {
    if (!project || !selectedUserId) return
    setTransferring(true)
    try {
      await transferProjectOwner(project.id, selectedUserId)
      setConfirmTransfer(false)
      onTransferred()
    } catch {
      // The board error banner displays the server response.
    } finally {
      setTransferring(false)
    }
  }

  if (!owner) return null

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel>Owner</FieldLabel>
      <div className="flex items-center gap-2 rounded-xl border p-3">
        <Avatar size="sm">
          {owner.avatar && (
            <AvatarImage
              src={owner.avatar}
              alt={owner.name}
              className="object-cover"
            />
          )}
          <AvatarFallback className="text-[9px]">
            {owner.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {owner.name}
        </span>
        <span className="text-xs text-muted-foreground">Owner</span>
      </div>

      {project && transferTargets.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed p-3">
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="min-w-0 flex-1">
              <SelectValue placeholder="Select the new owner..." />
            </SelectTrigger>
            <SelectContent>
              {transferTargets.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            disabled={!selectedUserId}
            onClick={() => setConfirmTransfer(true)}
          >
            Transfer ownership
          </Button>
        </div>
      )}

      <AlertDialog open={confirmTransfer} onOpenChange={setConfirmTransfer}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer project ownership?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedUser ? (
                <>
                  <strong>{selectedUser.name}</strong> will become the project
                  owner. You will become a regular member and will no longer be
                  able to edit project settings.
                </>
              ) : (
                "Select a new owner before continuing."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={transferring}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!selectedUser || transferring}
              onClick={() => void handleTransfer()}
            >
              Transfer ownership
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function ProjectSheet({
  open,
  onOpenChange,
  project,
}: ProjectSheetProps) {
  const isEdit = project !== null

  const templates = useBoardStore((s) => s.templates)
  const addProject = useBoardStore((s) => s.addProject)
  const updateProject = useBoardStore((s) => s.updateProject)
  const removeProject = useBoardStore((s) => s.removeProject)

  const currentUser = useAuthStore((s) => s.user)

  // Compute initial template + drafts once (the component is remounted via key
  // when the selected project changes, so initializers run fresh each time).
  const initialTemplateId = (() => {
    if (isEdit) return BLANK_TEMPLATE
    const defaultTemplate = templates.find(
      (t) => t.name === "Software Development"
    )
    return defaultTemplate?.id || templates[0]?.id || BLANK_TEMPLATE
  })()
  const initialDrafts = isEdit
    ? emptyDrafts
    : templateToDrafts(initialTemplateId, templates)

  const initialMembers: MemberDraft[] = []

  // Basic info
  const [name, setName] = useState(project?.name ?? "")
  const [description, setDescription] = useState(project?.description ?? "")

  // Template selection (add mode only)
  const [templateId, setTemplateId] = useState(initialTemplateId)

  // Draft collections (add mode - local state; edit mode - not used)
  const [stateDrafts, setStateDrafts] = useState<StateDraft[]>(
    initialDrafts.states
  )
  const [labelDrafts, setLabelDrafts] = useState<LabelDraft[]>(
    initialDrafts.labels
  )
  const [newState, setNewState] = useState<StateDraft>(emptyStateDraft)
  const [newLabel, setNewLabel] = useState<LabelDraft>(emptyLabelDraft)

  // Member drafts (add mode - local state collected for batch submission)
  const [memberDrafts, setMemberDrafts] =
    useState<MemberDraft[]>(initialMembers)

  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleTemplateChange = (value: string) => {
    setTemplateId(value)
    applyTemplate(value, templates, setStateDrafts, setLabelDrafts)
  }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      if (isEdit && project) {
        await updateProject(project.id, {
          name: name.trim(),
          description: description.trim() || undefined,
        })
      } else {
        await addProject({
          name: name.trim(),
          description: description.trim() || undefined,
          states: stateDrafts
            .filter((s) => s.name.trim())
            .map((s) => ({
              name: s.name.trim(),
              color: s.color,
              category: s.category,
            })),
          labels: labelDrafts
            .filter((l) => l.name.trim())
            .map((l) => ({ name: l.name.trim(), color: l.color })),
          members: memberDrafts.map((m) => ({
            userId: m.userId,
            role: m.role,
          })),
        })
      }
      onOpenChange(false)
    } catch {
      // The board error banner displays the server response.
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!project) return
    try {
      await removeProject(project.id)
      onOpenChange(false)
    } catch {
      // The board error banner displays the server response.
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg!">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit project" : "Add project"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update project details, workflow, labels and members."
              : "Create a project from a template or start from scratch."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 overflow-y-auto px-6">
          {/* Name */}
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="project-name">Name</FieldLabel>
            <Input
              id="project-name"
              placeholder="Project name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="project-description">Description</FieldLabel>
            <Textarea
              id="project-description"
              placeholder="Description (optional)..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Template (add mode only) */}
          {!isEdit && (
            <div className="flex flex-col gap-2">
              <FieldLabel>Template</FieldLabel>
              <Select value={templateId} onValueChange={handleTemplateChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={BLANK_TEMPLATE}>Blank project</SelectItem>
                </SelectContent>
              </Select>
              {templateId !== BLANK_TEMPLATE && (
                <p className="text-xs text-muted-foreground">
                  {templates.find((t) => t.id === templateId)?.description}
                </p>
              )}
            </div>
          )}

          {/* States */}
          <StatesSection
            isEdit={isEdit}
            project={project}
            drafts={stateDrafts}
            setDrafts={setStateDrafts}
            newState={newState}
            setNewState={setNewState}
          />

          {/* Labels */}
          <LabelsSection
            isEdit={isEdit}
            project={project}
            drafts={labelDrafts}
            setDrafts={setLabelDrafts}
            newLabel={newLabel}
            setNewLabel={setNewLabel}
          />

          {/* Owner */}
          <OwnerSection
            project={project}
            currentUser={currentUser}
            onTransferred={() => onOpenChange(false)}
          />

          {/* Members */}
          {isEdit && project ? (
            <MembersSection project={project} />
          ) : (
            <MembersAddSection
              drafts={memberDrafts}
              setDrafts={setMemberDrafts}
              ownerId={currentUser?.id}
            />
          )}

          {isEdit && project && <ProjectActivity projectId={project.id} />}
        </div>

        <SheetFooter className="flex-row items-center justify-between gap-2">
          {isEdit ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              Delete
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <SheetClose asChild>
              <Button variant="ghost">Cancel</Button>
            </SheetClose>
            <Button
              onClick={() => void handleSave()}
              disabled={!name.trim() || saving}
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create project"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{project?.name}</strong> and
              all tasks inside it. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void handleDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applyTemplate(
  id: string,
  templates: BoardTemplate[],
  setStates: (s: StateDraft[]) => void,
  setLabels: (l: LabelDraft[]) => void
) {
  const drafts = templateToDrafts(id, templates)
  setStates(drafts.states)
  setLabels(drafts.labels)
}

// ---------------------------------------------------------------------------
// States section
// ---------------------------------------------------------------------------

function StatesSection({
  isEdit,
  project,
  drafts,
  setDrafts,
  newState,
  setNewState,
}: {
  isEdit: boolean
  project: Project | null
  drafts: StateDraft[]
  setDrafts: (s: StateDraft[]) => void
  newState: StateDraft
  setNewState: (s: StateDraft) => void
}) {
  if (isEdit && project) {
    return <StatesEditSection project={project} />
  }
  return (
    <StateListEditor
      drafts={drafts}
      setDrafts={setDrafts}
      newState={newState}
      setNewState={setNewState}
    />
  )
}

function StateListEditor({
  drafts,
  setDrafts,
  newState,
  setNewState,
}: {
  drafts: StateDraft[]
  setDrafts: (s: StateDraft[]) => void
  newState: StateDraft
  setNewState: (s: StateDraft) => void
}) {
  const updateDraft = (id: string, key: keyof StateDraft, value: string) => {
    setDrafts(drafts.map((d) => (d.id === id ? { ...d, [key]: value } : d)))
  }
  const removeDraft = (id: string) =>
    setDrafts(drafts.filter((d) => d.id !== id))
  const moveDraft = (index: number, direction: -1 | 1) => {
    const next = [...drafts]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setDrafts(next)
  }
  const addDraft = () => {
    if (!newState.name.trim()) return
    setDrafts([
      ...drafts,
      {
        ...newState,
        id: `draft-state-${Date.now()}`,
        name: newState.name.trim(),
      },
    ])
    setNewState(emptyStateDraft)
  }

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel>Workflow states</FieldLabel>
      <div className="flex flex-col gap-2">
        {drafts.map((draft, index) => (
          <StateRow
            key={draft.id}
            draft={draft}
            index={index}
            total={drafts.length}
            onUpdate={(k, v) => updateDraft(draft.id, k, v)}
            onRemove={() => removeDraft(draft.id)}
            onMove={(dir) => moveDraft(index, dir)}
          />
        ))}
        <StateRow
          isNew
          draft={newState}
          index={0}
          total={0}
          onUpdate={(k, v) => setNewState({ ...newState, [k]: v })}
          onAdd={addDraft}
        />
      </div>
    </div>
  )
}

function StateRow({
  draft,
  index,
  total,
  isNew = false,
  onUpdate,
  onRemove,
  onMove,
  onAdd,
}: {
  draft: StateDraft
  index: number
  total: number
  isNew?: boolean
  onUpdate: (key: keyof StateDraft, value: string) => void
  onRemove?: () => void
  onMove?: (direction: -1 | 1) => void
  onAdd?: () => void
}) {
  return (
    <div
      className={cn(
        "grid gap-2 rounded-xl border p-3 md:grid-cols-[1fr_8rem_auto]",
        isNew && "border-dashed"
      )}
    >
      <div className="flex items-center gap-2">
        <ColorPicker
          value={draft.color}
          onChange={(v) => onUpdate("color", v)}
          size={24}
          aria-label="State color"
        />
        <Input
          placeholder={isNew ? "New state name" : "State name"}
          value={draft.name}
          onChange={(e) => onUpdate("name", e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onAdd) onAdd()
          }}
        />
      </div>
      <Select
        value={draft.category}
        onValueChange={(v) => onUpdate("category", v)}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATE_CATEGORY_META.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center justify-end gap-1">
        {!isNew && onMove && (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={index === 0}
              onClick={() => onMove(-1)}
              aria-label="Move up"
            >
              <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={index === total - 1}
              onClick={() => onMove(1)}
              aria-label="Move down"
            >
              <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
            </Button>
          </>
        )}
        {isNew ? (
          <Button size="sm" disabled={!draft.name.trim()} onClick={onAdd}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            Add
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-destructive hover:text-destructive"
            onClick={onRemove}
            aria-label="Delete state"
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
          </Button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// States edit section (edit mode - uses store actions directly)
// ---------------------------------------------------------------------------

function StatesEditSection({ project }: { project: Project }) {
  const states = useBoardStore((s) => s.states)
  const todos = useBoardStore((s) => s.todos)
  const addState = useBoardStore((s) => s.addState)
  const updateState = useBoardStore((s) => s.updateState)
  const removeState = useBoardStore((s) => s.removeState)
  const reorderState = useBoardStore((s) => s.reorderState)

  const [drafts, setDrafts] = useState<Record<string, StateDraft>>({})
  const [newState, setNewState] = useState<StateDraft>(emptyStateDraft)
  const [savingId, setSavingId] = useState<string | null>(null)

  const projectStates = states
    .filter((s) => s.projectId === project.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const updateDraft = (id: string, key: keyof StateDraft, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...projectStates.find((s) => s.id === id)!,
        ...prev[id],
        [key]: value,
      },
    }))
  }

  const handleSave = async (id: string) => {
    const draft = drafts[id]
    if (!draft?.name.trim()) return
    setSavingId(id)
    try {
      await updateState(id, {
        name: draft.name.trim(),
        color: draft.color,
        category: draft.category,
      })
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    } catch {
      // The board error banner displays the server response.
    } finally {
      setSavingId(null)
    }
  }

  const handleAdd = async () => {
    if (!newState.name.trim()) return
    setSavingId("new")
    try {
      await addState(project.id, {
        name: newState.name.trim(),
        color: newState.color,
        category: newState.category,
      })
      setNewState(emptyStateDraft)
    } catch {
      // The board error banner displays the server response.
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel>Workflow states</FieldLabel>
      <div className="flex flex-col gap-2">
        {projectStates.map((state, index) => {
          const draft = { ...state, ...drafts[state.id] }
          const taskCount = todos.filter((t) => t.stateId === state.id).length
          return (
            <div
              key={state.id}
              className="grid gap-2 rounded-xl border p-3 md:grid-cols-[1fr_8rem_auto]"
            >
              <div className="flex items-center gap-2">
                <ColorPicker
                  value={draft.color}
                  onChange={(v) => updateDraft(state.id, "color", v)}
                  size={24}
                  aria-label={`${state.name} color`}
                />
                <Input
                  value={draft.name}
                  onChange={(e) =>
                    updateDraft(state.id, "name", e.target.value)
                  }
                />
              </div>
              <Select
                value={draft.category}
                onValueChange={(v) => updateDraft(state.id, "category", v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATE_CATEGORY_META.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === 0}
                  onClick={() =>
                    void reorderState(state.id, -1).catch(() => {})
                  }
                  aria-label="Move up"
                >
                  <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === projectStates.length - 1}
                  onClick={() => void reorderState(state.id, 1).catch(() => {})}
                  aria-label="Move down"
                >
                  <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!draft.name.trim() || savingId === state.id}
                  onClick={() => void handleSave(state.id)}
                >
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive"
                  disabled={taskCount > 0}
                  title={
                    taskCount > 0
                      ? `${taskCount} tasks must be moved first`
                      : "Delete"
                  }
                  onClick={() =>
                    void removeState(state.id).catch(() => undefined)
                  }
                  aria-label="Delete state"
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                </Button>
              </div>
              {taskCount > 0 && (
                <p className="text-xs text-muted-foreground md:col-span-3">
                  {taskCount} task{taskCount === 1 ? "" : "s"} must be moved or
                  deleted first.
                </p>
              )}
            </div>
          )
        })}

        <StateRow
          isNew
          draft={newState}
          index={0}
          total={0}
          onUpdate={(k, v) => setNewState({ ...newState, [k]: v })}
          onAdd={() => void handleAdd()}
        />
        {savingId === "new" && (
          <p className="text-xs text-muted-foreground">Adding state…</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Labels section
// ---------------------------------------------------------------------------

function LabelsSection({
  isEdit,
  project,
  drafts,
  setDrafts,
  newLabel,
  setNewLabel,
}: {
  isEdit: boolean
  project: Project | null
  drafts: LabelDraft[]
  setDrafts: (l: LabelDraft[]) => void
  newLabel: LabelDraft
  setNewLabel: (l: LabelDraft) => void
}) {
  if (isEdit && project) {
    return <LabelsEditSection project={project} />
  }
  return (
    <LabelListEditor
      drafts={drafts}
      setDrafts={setDrafts}
      newLabel={newLabel}
      setNewLabel={setNewLabel}
    />
  )
}

function LabelListEditor({
  drafts,
  setDrafts,
  newLabel,
  setNewLabel,
}: {
  drafts: LabelDraft[]
  setDrafts: (l: LabelDraft[]) => void
  newLabel: LabelDraft
  setNewLabel: (l: LabelDraft) => void
}) {
  const updateDraft = (id: string, key: keyof LabelDraft, value: string) => {
    setDrafts(drafts.map((d) => (d.id === id ? { ...d, [key]: value } : d)))
  }
  const removeDraft = (id: string) =>
    setDrafts(drafts.filter((d) => d.id !== id))
  const addDraft = () => {
    if (!newLabel.name.trim()) return
    setDrafts([
      ...drafts,
      {
        ...newLabel,
        id: `draft-label-${Date.now()}`,
        name: newLabel.name.trim(),
      },
    ])
    setNewLabel(emptyLabelDraft)
  }

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel>Labels</FieldLabel>
      <div className="flex flex-col gap-2">
        {drafts.map((draft) => (
          <LabelRow
            key={draft.id}
            draft={draft}
            isNew={false}
            onUpdate={(k, v) => updateDraft(draft.id, k, v)}
            onRemove={() => removeDraft(draft.id)}
          />
        ))}
        <LabelRow
          isNew
          draft={newLabel}
          onUpdate={(k, v) => setNewLabel({ ...newLabel, [k]: v })}
          onAdd={addDraft}
        />
      </div>
    </div>
  )
}

function LabelRow({
  draft,
  isNew = false,
  onUpdate,
  onRemove,
  onAdd,
}: {
  draft: LabelDraft
  isNew?: boolean
  onUpdate: (key: keyof LabelDraft, value: string) => void
  onRemove?: () => void
  onAdd?: () => void
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border p-3",
        isNew && "border-dashed"
      )}
    >
      <ColorPicker
        value={draft.color}
        onChange={(v) => onUpdate("color", v)}
        size={24}
        aria-label="Label color"
      />
      <Input
        placeholder={isNew ? "New label name" : "Label name"}
        value={draft.name}
        onChange={(e) => onUpdate("name", e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onAdd) onAdd()
        }}
      />
      {isNew ? (
        <Button size="sm" disabled={!draft.name.trim()} onClick={onAdd}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          Add
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:text-destructive"
          onClick={onRemove}
          aria-label="Delete label"
        >
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Labels edit section (edit mode - uses store actions directly)
// ---------------------------------------------------------------------------

function LabelsEditSection({ project }: { project: Project }) {
  const labels = useBoardStore((s) => s.labels)
  const todos = useBoardStore((s) => s.todos)
  const addLabel = useBoardStore((s) => s.addLabel)
  const updateLabel = useBoardStore((s) => s.updateLabel)
  const removeLabel = useBoardStore((s) => s.removeLabel)

  const [drafts, setDrafts] = useState<Record<string, LabelDraft>>({})
  const [newLabel, setNewLabel] = useState<LabelDraft>(emptyLabelDraft)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{
    id: string
    name: string
  } | null>(null)

  const projectLabels = labels
    .filter((l) => l.projectId === project.id)
    .sort((a, b) => a.name.localeCompare(b.name))

  const updateDraft = (id: string, key: keyof LabelDraft, value: string) => {
    const original = projectLabels.find((l) => l.id === id)
    if (!original) return
    setDrafts((prev) => {
      const existing = prev[id]
      return {
        ...prev,
        [id]: {
          id,
          name: existing?.name ?? original.name,
          color: existing?.color ?? original.color,
          [key]: value,
        },
      }
    })
  }

  const handleSave = async (id: string) => {
    const draft = drafts[id]
    if (!draft?.name.trim()) return
    setSavingId(id)
    try {
      await updateLabel(id, { name: draft.name.trim(), color: draft.color })
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    } catch {
      // The board error banner displays the server response.
    } finally {
      setSavingId(null)
    }
  }

  const handleAdd = async () => {
    if (!newLabel.name.trim()) return
    setSavingId("new")
    try {
      await addLabel(project.id, {
        name: newLabel.name.trim(),
        color: newLabel.color,
      })
      setNewLabel(emptyLabelDraft)
    } catch {
      // The board error banner displays the server response.
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = async () => {
    if (!pendingDelete) return
    setSavingId(pendingDelete.id)
    try {
      await removeLabel(pendingDelete.id)
      setPendingDelete(null)
    } catch {
      // The board error banner displays the server response.
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel>Labels</FieldLabel>
      <div className="flex flex-col gap-2">
        {projectLabels.map((label) => {
          const draft = { ...label, ...drafts[label.id] }
          const taskCount = todos.filter((t) =>
            t.labels.includes(label.id)
          ).length
          return (
            <div
              key={label.id}
              className="flex items-center gap-2 rounded-xl border p-3"
            >
              <ColorPicker
                value={draft.color}
                onChange={(v) => updateDraft(label.id, "color", v)}
                size={24}
                aria-label={`${label.name} color`}
              />
              <Input
                value={draft.name}
                onChange={(e) => updateDraft(label.id, "name", e.target.value)}
              />
              <span className="w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                {taskCount} task{taskCount === 1 ? "" : "s"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={!draft.name.trim() || savingId === label.id}
                onClick={() => void handleSave(label.id)}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive hover:text-destructive"
                disabled={savingId === label.id}
                onClick={() =>
                  setPendingDelete({ id: label.id, name: label.name })
                }
                aria-label={`Delete ${label.name}`}
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              </Button>
            </div>
          )
        })}

        <LabelRow
          isNew
          draft={newLabel}
          onUpdate={(k, v) => setNewLabel({ ...newLabel, [k]: v })}
          onAdd={() => void handleAdd()}
        />
      </div>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(v) => !v && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete label?</AlertDialogTitle>
            <AlertDialogDescription>
              The label <strong>{pendingDelete?.name}</strong> will be removed
              from this project and all tasks using it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void handleDelete()}
            >
              Delete label
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Members add section (add mode - local drafts only)
// ---------------------------------------------------------------------------

function MembersAddSection({
  drafts,
  setDrafts,
  ownerId,
}: {
  drafts: MemberDraft[]
  setDrafts: (members: MemberDraft[]) => void
  ownerId?: string
}) {
  const [userOptions, setUserOptions] = useState<UserOption[]>([])
  const [selectedUserId, setSelectedUserId] = useState("")
  const [selectedRole, setSelectedRole] = useState<MemberRole>("member")

  useEffect(() => {
    void loadUsers(setUserOptions)
  }, [])

  const memberUserIds = new Set(drafts.map((m) => m.userId))
  const availableUsers = userOptions.filter(
    (u) => u.id !== ownerId && !memberUserIds.has(u.id)
  )

  const handleAdd = () => {
    if (!selectedUserId) return
    const user = userOptions.find((u) => u.id === selectedUserId)
    if (!user) return
    setDrafts([
      ...drafts,
      {
        id: `draft-member-${Date.now()}`,
        userId: user.id,
        name: user.name,
        avatar: user.avatar,
        role: selectedRole,
      },
    ])
    setSelectedUserId("")
    setSelectedRole("member")
  }

  const handleRemove = (id: string) => {
    setDrafts(drafts.filter((m) => m.id !== id))
  }

  const handleRoleChange = (id: string, role: MemberRole) => {
    setDrafts(drafts.map((m) => (m.id === id ? { ...m, role } : m)))
  }

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel>Members</FieldLabel>
      <div className="flex flex-col gap-2">
        {drafts.map((member) => (
          <div
            key={member.id}
            className="flex items-center gap-2 rounded-xl border p-3"
          >
            <Avatar size="sm">
              {member.avatar && (
                <AvatarImage
                  src={member.avatar}
                  alt={member.name}
                  className="object-cover"
                />
              )}
              <AvatarFallback className="text-[9px]">
                {member.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {member.name}
            </span>
            <Select
              value={member.role}
              onValueChange={(v) =>
                handleRoleChange(member.id, v as MemberRole)
              }
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              onClick={() => handleRemove(member.id)}
              aria-label={`Remove ${member.name}`}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            </Button>
          </div>
        ))}

        {/* Add member row */}
        {availableUsers.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-dashed p-3">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="min-w-0 flex-1">
                <SelectValue placeholder="Select a user..." />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={selectedRole}
              onValueChange={(v) => setSelectedRole(v as MemberRole)}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" disabled={!selectedUserId} onClick={handleAdd}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
              Add
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Members section (edit mode)
// ---------------------------------------------------------------------------

const ROLE_OPTIONS: { value: MemberRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
]

function MembersSection({ project }: { project: Project }) {
  const members = useBoardStore((s) => s.members)
  const addMember = useBoardStore((s) => s.addMember)
  const updateMember = useBoardStore((s) => s.updateMember)
  const removeMember = useBoardStore((s) => s.removeMember)

  const [userOptions, setUserOptions] = useState<UserOption[]>([])
  const [selectedUserId, setSelectedUserId] = useState("")
  const [selectedRole, setSelectedRole] = useState<MemberRole>("member")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (project) {
      void loadUsers(setUserOptions)
    }
  }, [project])

  const projectMembers = members
    .filter((m) => m.projectId === project.id)
    .sort((a, b) => a.name.localeCompare(b.name))

  // Users not yet members
  const memberUserIds = new Set(projectMembers.map((m) => m.userId))
  const availableUsers = userOptions.filter(
    (u) => u.id !== project.ownerId && !memberUserIds.has(u.id)
  )

  const handleAdd = async () => {
    if (!selectedUserId) return
    setSaving(true)
    try {
      await addMember(project.id, {
        userId: selectedUserId,
        role: selectedRole,
      })
      setSelectedUserId("")
      setSelectedRole("member")
    } catch {
      // The board error banner displays the server response.
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel>Members</FieldLabel>
      <div className="flex flex-col gap-2">
        {projectMembers.map((member) => (
          <div
            key={member.id}
            className="flex items-center gap-2 rounded-xl border p-3"
          >
            <Avatar size="sm">
              {member.avatar && (
                <AvatarImage
                  src={member.avatar}
                  alt={member.name}
                  className="object-cover"
                />
              )}
              <AvatarFallback className="text-[9px]">
                {member.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {member.name}
            </span>
            <Select
              value={member.role}
              onValueChange={(v) =>
                void updateMember(member.id, {
                  role: v as MemberRole,
                }).catch(() => {})
              }
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              onClick={() => void removeMember(member.id).catch(() => {})}
              aria-label={`Remove ${member.name}`}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            </Button>
          </div>
        ))}

        {/* Add member row */}
        {availableUsers.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-dashed p-3">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="min-w-0 flex-1">
                <SelectValue placeholder="Select a user..." />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={selectedRole}
              onValueChange={(v) => setSelectedRole(v as MemberRole)}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!selectedUserId || saving}
              onClick={() => void handleAdd()}
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
              Add
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

async function loadUsers(setUsers: (users: UserOption[]) => void) {
  try {
    const records = await pb.collection("users").getFullList({
      sort: "name",
      fields: "id,name,email,avatar,collectionId",
    })
    setUsers(
      records.map((r) => ({
        id: r.id,
        name: r.name || r.email || "Unknown",
        avatar: r.avatar ? pb.files.getURL(r, r.avatar) : undefined,
      }))
    )
  } catch {
    setUsers([])
  }
}
