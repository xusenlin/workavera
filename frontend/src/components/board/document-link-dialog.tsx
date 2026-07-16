import { useEffect, useMemo, useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  AlertCircleIcon,
  File01Icon,
  SourceCodeIcon,
  Search02Icon,
  Tick02Icon,
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
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { pb } from "@/lib/pocketbase"

type DocOption = {
  id: string
  title: string
  kind?: string
}

type DocumentLinkDialogProps = {
  projectId: string
  selected: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (documentIds: string[]) => void
}

export function DocumentLinkDialog({
  projectId,
  selected,
  open,
  onOpenChange,
  onConfirm,
}: DocumentLinkDialogProps) {
  const [options, setOptions] = useState<DocOption[]>([])
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Reset the selection to the incoming prop each time the dialog opens
  // (render-phase reset, the React-recommended way to adjust state on a prop
  // change without an effect).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setChosen(new Set(selected))
      setQuery("")
      setLoading(true)
      setError(null)
      setOptions([])
    }
  }

  useEffect(() => {
    if (!open) return
    let active = true
    pb.collection("docs")
      .getList<DocOption>(1, 200, {
        sort: "-updated",
        filter: `project = "${projectId}" && status = "draft"`,
        requestKey: null,
      })
      .then((result) => {
        if (active)
          setOptions(
            result.items.map(({ id, title, kind }) => ({ id, title, kind }))
          )
      })
      .catch((loadError) => {
        if (active)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load documents"
          )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, projectId])

  const visibleOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return options
    return options.filter((option) =>
      option.title.toLowerCase().includes(normalized)
    )
  }, [query, options])

  const toggle = (id: string) => {
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleConfirm = () => {
    onConfirm([...chosen])
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link documents</DialogTitle>
          <DialogDescription>
            Choose documents from this project to link to the task.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <HugeiconsIcon
              icon={AlertCircleIcon}
              strokeWidth={2}
              className="mt-0.5 size-4 shrink-0"
            />
            <span>{error}</span>
          </div>
        )}

        <div className="relative">
          <HugeiconsIcon
            icon={Search02Icon}
            strokeWidth={2}
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search documents..."
            className="pl-9"
          />
        </div>

        <div className="max-h-64 overflow-y-auto rounded-xl border p-1">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Spinner className="size-5" />
            </div>
          ) : visibleOptions.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {options.length === 0
                ? "This project has no documents yet."
                : "No documents match your search."}
            </p>
          ) : (
            visibleOptions.map((option) => {
              const checked = chosen.has(option.id)
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => toggle(option.id)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted",
                    checked && "bg-primary/5"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded border",
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input"
                    )}
                  >
                    {checked && (
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        strokeWidth={2.5}
                        className="size-3.5"
                      />
                    )}
                  </span>
                  <HugeiconsIcon
                    icon={option.kind === "html" ? SourceCodeIcon : File01Icon}
                    strokeWidth={2}
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {option.title || "Untitled document"}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            {`Link ${chosen.size} document${chosen.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
