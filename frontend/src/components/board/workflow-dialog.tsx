import { useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  STATE_CATEGORY_META,
  useBoardStore,
  type Project,
  type ProjectState,
  type StateCategory,
  type Todo,
} from "@/store/board"

type WorkflowDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project
  states: ProjectState[]
  todos: Todo[]
}

type StateDraft = Pick<ProjectState, "name" | "color" | "category">

const emptyDraft: StateDraft = {
  name: "",
  color: "#64748b",
  category: "pending",
}

export function WorkflowDialog({
  open,
  onOpenChange,
  project,
  states,
  todos,
}: WorkflowDialogProps) {
  const addState = useBoardStore((store) => store.addState)
  const updateState = useBoardStore((store) => store.updateState)
  const removeState = useBoardStore((store) => store.removeState)
  const reorderState = useBoardStore((store) => store.reorderState)
  const [drafts, setDrafts] = useState<Record<string, StateDraft>>({})
  const [newState, setNewState] = useState<StateDraft>(emptyDraft)
  const [savingId, setSavingId] = useState<string | null>(null)

  const updateDraft = <K extends keyof StateDraft>(
    id: string,
    key: K,
    value: StateDraft[K]
  ) => {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], [key]: value },
    }))
  }

  const handleSave = async (id: string) => {
    const draft = drafts[id]
    if (!draft?.name.trim()) return
    setSavingId(id)
    try {
      await updateState(id, { ...draft, name: draft.name.trim() })
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
      await addState(project.id, { ...newState, name: newState.name.trim() })
      setNewState(emptyDraft)
    } catch {
      // The board error banner displays the server response.
    } finally {
      setSavingId(null)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          setDrafts({})
          setNewState(emptyDraft)
        }
        onOpenChange(value)
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Configure workflow</DialogTitle>
          <DialogDescription>
            Edit the states used by {project.name}. Changes only affect this project.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
          {states.map((state, index) => {
            const draft = drafts[state.id] || state
            const taskCount = todos.filter((todo) => todo.stateId === state.id).length
            return (
              <div key={state.id} className="grid gap-2 rounded-xl border p-3 md:grid-cols-[1fr_9rem_auto]">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={draft.color}
                    onChange={(event) => updateDraft(state.id, "color", event.target.value)}
                    className="size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
                    aria-label={`${state.name} color`}
                  />
                  <Input
                    value={draft.name}
                    onChange={(event) => updateDraft(state.id, "name", event.target.value)}
                    aria-label="State name"
                  />
                </div>
                <Select
                  value={draft.category}
                  onValueChange={(value) =>
                    updateDraft(state.id, "category", value as StateCategory)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATE_CATEGORY_META.map((category) => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === 0}
                    onClick={() => void reorderState(state.id, -1)}
                    aria-label="Move state up"
                  >
                    <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === states.length - 1}
                    onClick={() => void reorderState(state.id, 1)}
                    aria-label="Move state down"
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
                    title={taskCount > 0 ? `Move or delete ${taskCount} tasks first` : "Delete state"}
                    onClick={() => void removeState(state.id).catch(() => undefined)}
                    aria-label="Delete state"
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  </Button>
                </div>
                {taskCount > 0 && (
                  <p className="text-muted-foreground text-xs md:col-span-3">
                    {taskCount} task{taskCount === 1 ? "" : "s"} must be moved or deleted before this state can be removed.
                  </p>
                )}
              </div>
            )
          })}

          <div className="grid gap-2 rounded-xl border border-dashed p-3 md:grid-cols-[1fr_9rem_auto]">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={newState.color}
                onChange={(event) => setNewState((current) => ({ ...current, color: event.target.value }))}
                className="size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
                aria-label="New state color"
              />
              <Input
                placeholder="New state name"
                value={newState.name}
                onChange={(event) => setNewState((current) => ({ ...current, name: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleAdd()
                }}
              />
            </div>
            <Select
              value={newState.category}
              onValueChange={(value) =>
                setNewState((current) => ({ ...current, category: value as StateCategory }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATE_CATEGORY_META.map((category) => (
                  <SelectItem key={category.value} value={category.value}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button disabled={!newState.name.trim() || savingId === "new"} onClick={() => void handleAdd()}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
              Add state
            </Button>
          </div>
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
