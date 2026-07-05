import { useEffect, useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  AlertCircleIcon,
  Brain02Icon,
  Delete02Icon,
  Edit01Icon,
  Key01Icon,
  Pin02Icon,
  Share08Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import { ModelCopyDialog } from "@/components/model-copy-dialog"
import { ModelSheet } from "@/components/model-sheet"
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
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useLlmSettingsStore, type LlmModelConfig } from "@/store/llm-settings"

export function SettingsPage() {
  const models = useLlmSettingsStore((state) => state.models)
  const loading = useLlmSettingsStore((state) => state.loading)
  const initialized = useLlmSettingsStore((state) => state.initialized)
  const error = useLlmSettingsStore((state) => state.error)
  const initialize = useLlmSettingsStore((state) => state.initialize)
  const clearError = useLlmSettingsStore((state) => state.clearError)
  const removeModel = useLlmSettingsStore((state) => state.removeModel)
  const setDefaultModel = useLlmSettingsStore((state) => state.setDefaultModel)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetModel, setSheetModel] = useState<LlmModelConfig | null>(null)
  const [deleteModel, setDeleteModel] = useState<LlmModelConfig | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [copyDialogOpen, setCopyDialogOpen] = useState(false)
  const [copySource, setCopySource] = useState<LlmModelConfig | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    void initialize()
  }, [initialize])

  const openAddSheet = () => {
    setSheetModel(null)
    setSheetOpen(true)
  }

  const openEditSheet = (model: LlmModelConfig) => {
    setSheetModel(model)
    setSheetOpen(true)
  }

  const openCopyDialog = (model: LlmModelConfig) => {
    setCopySource(model)
    setCopyDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteModel) return
    setDeleting(true)
    try {
      await removeModel(deleteModel.id)
      setDeleteModel(null)
    } catch {
      // The store exposes the request error in the page-level alert.
    } finally {
      setDeleting(false)
    }
  }

  const handleSetDefault = async (id: string) => {
    try {
      await setDefaultModel(id)
    } catch {
      // The store exposes the request error in the page-level alert.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your preferences and configure model providers.
        </p>
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-foreground">
          <HugeiconsIcon
            icon={Tick02Icon}
            strokeWidth={2}
            className="size-4 text-primary"
          />
          <span>{notice}</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setNotice(null)}
          >
            Dismiss
          </Button>
        </div>
      )}

      {error && initialized && (
        <div className="flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <HugeiconsIcon
            icon={AlertCircleIcon}
            strokeWidth={2}
            className="size-4 shrink-0"
          />
          <span>{error}</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={clearError}
          >
            Dismiss
          </Button>
        </div>
      )}

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
              <CardTitle>Large Language Model</CardTitle>
              <CardDescription>
                Manage the model configurations available to your account.
              </CardDescription>
            </div>
            <Button size="sm" onClick={openAddSheet}>
              <HugeiconsIcon
                icon={Add01Icon}
                strokeWidth={2}
                className="size-4"
              />
              Add model
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading && !initialized ? (
            <div className="flex flex-col gap-4 px-6 py-6">
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-72 max-w-full" />
                  </div>
                  <Skeleton className="size-8" />
                </div>
              ))}
            </div>
          ) : error && !initialized ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={2} />
              </div>
              <div>
                <p className="text-sm font-medium">Could not load models</p>
                <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void initialize(true)}
              >
                Retry
              </Button>
            </div>
          ) : models.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <HugeiconsIcon
                  icon={Brain02Icon}
                  strokeWidth={2}
                  className="size-5"
                />
              </div>
              <p className="text-sm font-medium">No models configured</p>
              <p className="text-xs text-muted-foreground">
                Add a model configuration to get started.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {models.map((model, index) => (
                <li key={model.id}>
                  {index > 0 && <Separator />}
                  <div className="flex items-center gap-3 px-6 py-3.5 transition-colors hover:bg-muted/30">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {model.name}
                        </span>
                        <Badge variant="secondary" className="capitalize">
                          {model.protocol}
                        </Badge>
                        {model.hasApiKey && (
                          <Badge variant="outline" className="gap-1">
                            <HugeiconsIcon icon={Key01Icon} strokeWidth={2} />
                            Key configured
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {model.modelId} · {model.baseUrl}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          if (!model.isDefault) void handleSetDefault(model.id)
                        }}
                        className={
                          model.isDefault
                            ? "text-emerald-500 hover:text-emerald-500"
                            : undefined
                        }
                        aria-label={
                          model.isDefault ? "Default model" : "Set as default"
                        }
                        aria-pressed={model.isDefault}
                      >
                        <HugeiconsIcon icon={Pin02Icon} strokeWidth={2} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openCopyDialog(model)}
                        aria-label="Copy to users"
                      >
                        <HugeiconsIcon icon={Share08Icon} strokeWidth={2} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEditSheet(model)}
                        aria-label="Edit model"
                      >
                        <HugeiconsIcon icon={Edit01Icon} strokeWidth={2} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleteModel(model)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Delete model"
                      >
                        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ModelSheet
        key={sheetModel?.id ?? "new-model"}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open)
          if (!open) setSheetModel(null)
        }}
        model={sheetModel}
      />

      <ModelCopyDialog
        key={copySource?.id ?? "copy-model"}
        open={copyDialogOpen}
        onOpenChange={(open) => {
          setCopyDialogOpen(open)
          if (!open) setCopySource(null)
        }}
        model={copySource}
        onCopied={(count) =>
          setNotice(
            `Configuration copied to ${count} user${count === 1 ? "" : "s"}.`
          )
        }
      />

      <AlertDialog
        open={deleteModel !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteModel(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete model configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteModel?.name}” will be permanently removed from your
              account. Copies previously sent to other users are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault()
                void handleDelete()
              }}
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
