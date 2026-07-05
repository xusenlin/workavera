import { useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons"

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
import { Input } from "@/components/ui/input"
import { useBoardStore, type Label, type Project, type Todo } from "@/store/board"

type LabelsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project
  labels: Label[]
  todos: Todo[]
}

type LabelDraft = Pick<Label, "name" | "color">

const emptyDraft: LabelDraft = {
  name: "",
  color: "#64748b",
}

export function LabelsDialog({
  open,
  onOpenChange,
  project,
  labels,
  todos,
}: LabelsDialogProps) {
  const addLabel = useBoardStore((store) => store.addLabel)
  const updateLabel = useBoardStore((store) => store.updateLabel)
  const removeLabel = useBoardStore((store) => store.removeLabel)
  const [drafts, setDrafts] = useState<Record<string, LabelDraft>>({})
  const [newLabel, setNewLabel] = useState<LabelDraft>(emptyDraft)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Label | null>(null)

  const updateDraft = <K extends keyof LabelDraft>(
    id: string,
    key: K,
    value: LabelDraft[K]
  ) => {
    const label = labels.find((item) => item.id === id)
    if (!label) return
    setDrafts((current) => ({
      ...current,
      [id]: {
        name: current[id]?.name ?? label.name,
        color: current[id]?.color ?? label.color,
        [key]: value,
      },
    }))
  }

  const handleSave = async (label: Label) => {
    const draft = drafts[label.id] || label
    if (!draft.name.trim()) return
    setSavingId(label.id)
    try {
      await updateLabel(label.id, { ...draft, name: draft.name.trim() })
      setDrafts((current) => {
        const next = { ...current }
        delete next[label.id]
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
      await addLabel(project.id, { ...newLabel, name: newLabel.name.trim() })
      setNewLabel(emptyDraft)
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
    <>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) {
            setDrafts({})
            setNewLabel(emptyDraft)
          }
          onOpenChange(value)
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Manage labels</DialogTitle>
            <DialogDescription>
              Create and edit the labels available to tasks in {project.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
            {labels.map((label) => {
              const draft = drafts[label.id] || label
              const taskCount = todos.filter((todo) => todo.labels.includes(label.id)).length
              return (
                <div key={label.id} className="flex items-center gap-2 rounded-xl border p-3">
                  <input
                    type="color"
                    value={draft.color}
                    onChange={(event) => updateDraft(label.id, "color", event.target.value)}
                    className="size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
                    aria-label={`${label.name} color`}
                  />
                  <Input
                    value={draft.name}
                    onChange={(event) => updateDraft(label.id, "name", event.target.value)}
                    aria-label="Label name"
                  />
                  <span className="text-muted-foreground w-14 shrink-0 text-right text-xs tabular-nums">
                    {taskCount} task{taskCount === 1 ? "" : "s"}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!draft.name.trim() || savingId === label.id}
                    onClick={() => void handleSave(label)}
                  >
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    disabled={savingId === label.id}
                    onClick={() => setPendingDelete(label)}
                    aria-label={`Delete ${label.name}`}
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  </Button>
                </div>
              )
            })}

            <div className="flex items-center gap-2 rounded-xl border border-dashed p-3">
              <input
                type="color"
                value={newLabel.color}
                onChange={(event) =>
                  setNewLabel((current) => ({ ...current, color: event.target.value }))
                }
                className="size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
                aria-label="New label color"
              />
              <Input
                placeholder="New label name"
                value={newLabel.name}
                onChange={(event) =>
                  setNewLabel((current) => ({ ...current, name: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleAdd()
                }}
              />
              <Button
                disabled={!newLabel.name.trim() || savingId === "new"}
                onClick={() => void handleAdd()}
              >
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                Add label
              </Button>
            </div>
          </div>

          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(value) => !value && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete label?</AlertDialogTitle>
            <AlertDialogDescription>
              The label <strong>{pendingDelete?.name}</strong> will be removed from this project and all tasks using it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void handleDelete()}>
              Delete label
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
