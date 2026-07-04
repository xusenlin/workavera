import { useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useBoardStore } from "@/store/board"

const BLANK_TEMPLATE = "blank"

export function ProjectAddDialog() {
  const templates = useBoardStore((store) => store.templates)
  const addProject = useBoardStore((store) => store.addProject)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [templateId, setTemplateId] = useState(BLANK_TEMPLATE)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const defaultTemplateId = () => {
    const defaultTemplate = templates.find((template) => template.name === "Software Development")
    return defaultTemplate?.id || templates[0]?.id || BLANK_TEMPLATE
  }

  const reset = () => {
    setName("")
    setDescription("")
    setTemplateId(BLANK_TEMPLATE)
  }

  const handleAdd = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await addProject({
        name: name.trim(),
        description: description.trim(),
        templateId: templateId === BLANK_TEMPLATE ? undefined : templateId,
      })
      reset()
      setOpen(false)
    } catch {
      // The board error banner displays the server response.
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        if (!value) reset()
        else setTemplateId(defaultTemplateId())
        setOpen(value)
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm">
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
          Add project
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium">Create project</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Choose a template or start with an empty workflow.
            </p>
          </div>
          <Input
            placeholder="Project name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
          <Textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a template" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                </SelectItem>
              ))}
              <SelectItem value={BLANK_TEMPLATE}>Blank project</SelectItem>
            </SelectContent>
          </Select>
          {templateId !== BLANK_TEMPLATE && (
            <p className="text-muted-foreground text-xs">
              {templates.find((template) => template.id === templateId)?.description}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void handleAdd()} disabled={!name.trim() || saving}>
              {saving ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
