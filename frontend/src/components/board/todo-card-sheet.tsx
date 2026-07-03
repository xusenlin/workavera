import { useEffect, useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import { Delete02Icon } from "@hugeicons/core-free-icons"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
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
  STATUS_META,
  useBoardStore,
  type Priority,
  type Todo,
  type TodoStatus,
} from "@/store/board"

type TodoCardSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  todo: Todo | null
  projectId: string
  defaultStatus?: TodoStatus
}

type FormState = {
  title: string
  description: string
  priority: Priority
  status: TodoStatus
  labels: string[]
  members: string[]
  dueDate: string
}

const emptyForm: FormState = {
  title: "",
  description: "",
  priority: "medium",
  status: "todo",
  labels: [],
  members: [],
  dueDate: "",
}

export function TodoCardSheet({
  open,
  onOpenChange,
  todo,
  projectId,
  defaultStatus,
}: TodoCardSheetProps) {
  const addTodo = useBoardStore((s) => s.addTodo)
  const updateTodo = useBoardStore((s) => s.updateTodo)
  const removeTodo = useBoardStore((s) => s.removeTodo)
  const labels = useBoardStore((s) => s.labels)
  const members = useBoardStore((s) => s.members)

  const [form, setForm] = useState<FormState>(emptyForm)

  useEffect(() => {
    if (open) {
      if (todo) {
        setForm({
          title: todo.title,
          description: todo.description ?? "",
          priority: todo.priority,
          status: todo.status,
          labels: [...todo.labels],
          members: [...todo.members],
          dueDate: todo.dueDate ?? "",
        })
      } else {
        setForm({
          ...emptyForm,
          status: defaultStatus ?? "todo",
        })
      }
    }
  }, [open, todo, defaultStatus])

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

  const handleSave = () => {
    if (!form.title.trim()) return

    const data = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      priority: form.priority,
      status: form.status,
      labels: form.labels,
      members: form.members,
      dueDate: form.dueDate || undefined,
    }

    if (todo) {
      updateTodo(todo.id, data)
    } else {
      addTodo({ projectId, ...data })
    }
    onOpenChange(false)
  }

  const handleDelete = () => {
    if (todo) {
      removeTodo(todo.id)
      onOpenChange(false)
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
                value={form.status}
                onValueChange={(v) => setField("status", v as TodoStatus)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_META.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.label}
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
            <Input
              id="todo-due"
              type="date"
              value={form.dueDate}
              onChange={(e) => setField("dueDate", e.target.value)}
            />
          </div>

          {/* Labels */}
          <div className="flex flex-col gap-2">
            <Label>Labels</Label>
            <div className="flex flex-wrap gap-2">
              {labels.map((label) => {
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
              {members.map((member) => {
                const selected = form.members.includes(member.id)
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => toggleArrayItem("members", member.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-2 py-1 text-xs transition-all",
                      selected
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    <Avatar size="sm">
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
              onClick={handleDelete}
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
            <Button onClick={handleSave} disabled={!form.title.trim()}>
              {todo ? "Save changes" : "Add task"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
