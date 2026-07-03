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
import { useBoardStore } from "@/store/board"

export function ProjectAddDialog() {
  const addProject = useBoardStore((s) => s.addProject)
  const [name, setName] = useState("")
  const [open, setOpen] = useState(false)

  const handleAdd = () => {
    if (!name.trim()) return
    addProject(name.trim())
    setName("")
    setOpen(false)
  }

  const handleOpenChange = (value: boolean) => {
    if (!value) setName("")
    setOpen(value)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm">
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
          Add project
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium">Project name</label>
          <Input
            placeholder="My new project"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd()
            }}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={!name.trim()}>
              Add
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
