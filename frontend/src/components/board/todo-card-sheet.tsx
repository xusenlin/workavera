import { useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import { Delete02Icon } from "@hugeicons/core-free-icons"

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
import { DatePicker } from "@/components/ui/date-picker"
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
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  PRIORITY_META,
  useBoardStore,
  type Priority,
  type Todo,
} from "@/store/board"

type TodoCardSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  todo: Todo | null
  projectId: string
  defaultStateId?: string
}

type FormState = {
  title: string
  description: string
  priority: Priority
  stateId: string
  labels: string[]
  members: string[]
  dueDate: string
}

const emptyForm: FormState = {
  title: "",
  description: "",
  priority: "medium",
  stateId: "",
  labels: [],
  members: [],
  dueDate: "",
}

function initialForm(todo: Todo | null, defaultStateId?: string): FormState {
  if (!todo) return { ...emptyForm, stateId: defaultStateId ?? "" }
  return {
    title: todo.title,
    description: todo.description ?? "",
    priority: todo.priority,
    stateId: todo.stateId,
    labels: [...todo.labels],
    members: [...todo.members],
    dueDate: todo.dueDate ?? "",
  }
}

export function TodoCardSheet({
  open,
  onOpenChange,
  todo,
  projectId,
  defaultStateId,
}: TodoCardSheetProps) {
  const addTodo = useBoardStore((s) => s.addTodo)
  const updateTodo = useBoardStore((s) => s.updateTodo)
  const removeTodo = useBoardStore((s) => s.removeTodo)
  const labels = useBoardStore((s) => s.labels)
  const members = useBoardStore((s) => s.members)
  const states = useBoardStore((s) => s.states)

  const [form, setForm] = useState<FormState>(() => initialForm(todo, defaultStateId))
  const [confirmDelete, setConfirmDelete] = useState(false)

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const toggleArrayItem = (key: "labels" | "members", id: string) => {
    setForm((prev) => {
      const arr = prev[key]
      return {
        ...prev,
        [key]: arr.includes(id)
          ? arr.filter((item) => item !== id)
          : [...arr, id],
      }
    })
  }

  const currentProjectId = todo?.projectId || projectId
  const projectStates = states
    .filter((state) => state.projectId === currentProjectId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const projectLabels = labels.filter((label) => label.projectId === currentProjectId)
  const projectMembers = members.filter((member) => member.projectId === currentProjectId)

  const handleSave = async () => {
    if (!form.title.trim() || !form.stateId) return

    const data = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      priority: form.priority,
      stateId: form.stateId,
      labels: form.labels,
      members: form.members,
      dueDate: form.dueDate || undefined,
    }

    try {
      if (todo) {
        await updateTodo(todo.id, data)
      } else {
        await addTodo({ projectId, ...data })
      }
      onOpenChange(false)
    } catch {
      // The board error banner displays the server response.
    }
  }

  const handleDelete = async () => {
    if (todo) {
      try {
        await removeTodo(todo.id)
        onOpenChange(false)
      } catch {
        // The board error banner displays the server response.
      }
    }
  }

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      setForm(emptyForm)
    }
    onOpenChange(value)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{todo ? "Edit task" : "Add task"}</SheetTitle>
          <SheetDescription>
            {todo
              ? "Update the task details below."
              : "Fill in the details for your new task."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 overflow-y-auto px-6">
          {/* Title */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="todo-title">Title</Label>
            <Input
              id="todo-title"
              placeholder="Task title..."
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="todo-description">Description</Label>
            <Textarea
              id="todo-description"
              placeholder="Add more details..."
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
            />
          </div>

          {/* Status + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label>Status</Label>
              <Select
                value={form.stateId}
                onValueChange={(value) => setField("stateId", value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projectStates.map((state) => (
                    <SelectItem key={state.id} value={state.id}>
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: state.color }}
                      />
                      {state.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setField("priority", v as Priority)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_META.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Due date */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="todo-due">Due date</Label>
            <DatePicker
              value={form.dueDate}
              onChange={(v) => setField("dueDate", v)}
            />
          </div>

          {/* Labels */}
          <div className="flex flex-col gap-2">
            <Label>Labels</Label>
            <div className="flex flex-wrap gap-2">
              {projectLabels.map((label) => {
                const selected = form.labels.includes(label.id)
                return (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() => toggleArrayItem("labels", label.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-all",
                      selected
                        ? "text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                    )}
                    style={selected ? { backgroundColor: label.color } : undefined}
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{
                        backgroundColor: selected
                          ? "rgba(255,255,255,0.5)"
                          : label.color,
                      }}
                    />
                    {label.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Members */}
          <div className="flex flex-col gap-2">
            <Label>Members</Label>
            <div className="flex flex-wrap gap-2">
              {projectMembers.map((member) => {
                const selected = form.members.includes(member.userId)
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => toggleArrayItem("members", member.userId)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-2 py-1 text-xs transition-all",
                      selected
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    )}
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
                    {member.name}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <SheetFooter className="flex-row items-center justify-between gap-2">
          {todo ? (
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
            <Button onClick={() => void handleSave()} disabled={!form.title.trim() || !form.stateId}>
              {todo ? "Save changes" : "Add task"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove "{todo?.title}" from the board. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void handleDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}
