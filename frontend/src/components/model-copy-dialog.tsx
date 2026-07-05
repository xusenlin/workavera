import { useEffect, useMemo, useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  AlertCircleIcon,
  Search02Icon,
  Tick02Icon,
  UserMultipleIcon,
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
import { useLlmSettingsStore, type LlmModelConfig } from "@/store/llm-settings"

type ModelCopyDialogProps = {
  model: LlmModelConfig | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onCopied: (count: number) => void
}

export function ModelCopyDialog({
  model,
  open,
  onOpenChange,
  onCopied,
}: ModelCopyDialogProps) {
  const shareTargets = useLlmSettingsStore((state) => state.shareTargets)
  const loadShareTargets = useLlmSettingsStore(
    (state) => state.loadShareTargets
  )
  const copyModel = useLlmSettingsStore((state) => state.copyModel)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [copying, setCopying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    void loadShareTargets()
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load users"
        )
      })
      .finally(() => setLoading(false))
  }, [loadShareTargets, open])

  const visibleTargets = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return shareTargets
    return shareTargets.filter((target) =>
      target.name.toLowerCase().includes(normalized)
    )
  }, [query, shareTargets])

  const toggleUser = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCopy = async () => {
    if (!model || selected.size === 0) return
    setCopying(true)
    setError(null)
    try {
      const count = await copyModel(model.id, [...selected])
      onOpenChange(false)
      onCopied(count)
    } catch (copyError) {
      setError(
        copyError instanceof Error
          ? copyError.message
          : "Could not copy model configuration"
      )
    } finally {
      setCopying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy model configuration</DialogTitle>
          <DialogDescription>
            Select the users who should receive an independent copy of “
            {model?.name}”.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/5 p-3 text-foreground">
          <HugeiconsIcon
            icon={UserMultipleIcon}
            strokeWidth={2}
            className="mt-0.5 size-4 shrink-0 text-primary"
          />
          <p className="text-xs leading-relaxed">
            The configuration will be securely copied to the selected users. The
            API key is never shown to recipients and is only used by the server
            when calling the model. After copying, each configuration is
            independent and later changes will not be synchronized.
          </p>
        </div>

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
            placeholder="Search users..."
            className="pl-9"
          />
        </div>

        <div className="max-h-64 overflow-y-auto rounded-xl border p-1">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Spinner className="size-5" />
            </div>
          ) : visibleTargets.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {shareTargets.length === 0
                ? "No other users are available."
                : "No users match your search."}
            </p>
          ) : (
            visibleTargets.map((target) => {
              const checked = selected.has(target.id)
              return (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => toggleUser(target.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted",
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
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {target.name}
                  </span>
                  <code className="text-[10px] text-muted-foreground">
                    {target.id.slice(-6)}
                  </code>
                </button>
              )
            })
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={copying}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleCopy()}
            disabled={copying || selected.size === 0}
          >
            {copying
              ? "Copying..."
              : `Copy to ${selected.size || 0} user${selected.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
