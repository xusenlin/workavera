import { useEffect, useState } from "react"
import { toast } from "sonner"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  AlertCircleIcon,
  Brain02Icon,
  Delete02Icon,
  Edit01Icon,
  Pin02Icon,
  Share08Icon,
  Tick02Icon,
  TimeZoneIcon,
  Sun03Icon,
  Moon02Icon,
  ComputerIcon,
} from "@hugeicons/core-free-icons"

import { ModelCopyDialog } from "@/components/model-copy-dialog"
import { ModelSheet } from "@/components/model-sheet"
import { useTheme } from "@/components/theme-provider"
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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  useLlmSettingsStore,
  DEFAULT_MAX_OUTPUT_TOKENS,
  type LlmModelConfig,
} from "@/store/llm-settings"
import { cn } from "@/lib/utils"
import { pb } from "@/lib/pocketbase"

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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Model</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Protocol
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Max tokens
                  </TableHead>
                  <TableHead className="pr-6 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((model) => (
                  <TableRow key={model.id}>
                    <TableCell className="pl-6">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{model.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {model.modelId} · {model.baseUrl}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="secondary" className="capitalize">
                        {model.protocol}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {(model.maxOutputTokens > 0
                        ? model.maxOutputTokens
                        : DEFAULT_MAX_OUTPUT_TOKENS
                      ).toLocaleString()}
                    </TableCell>
                    <TableCell className="pr-6">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            if (!model.isDefault)
                              void handleSetDefault(model.id)
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
                          aria-label="Share with users"
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SystemSettingsCard />

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
        onShared={(count) =>
          setNotice(
            `Share invitation sent to ${count} user${count === 1 ? "" : "s"}.`
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

const COMMON_TIMEZONES = [
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai (UTC+8)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (UTC+9)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (UTC+8)" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata (UTC+5:30)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (UTC+4)" },
  { value: "Europe/London", label: "Europe/London (UTC+0/+1)" },
  { value: "Europe/Paris", label: "Europe/Paris (UTC+1/+2)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (UTC+1/+2)" },
  { value: "Europe/Moscow", label: "Europe/Moscow (UTC+3)" },
  { value: "America/New_York", label: "America/New_York (UTC-5/-4)" },
  { value: "America/Chicago", label: "America/Chicago (UTC-6/-5)" },
  { value: "America/Denver", label: "America/Denver (UTC-7/-6)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (UTC-8/-7)" },
  { value: "America/Sao_Paulo", label: "America/Sao_Paulo (UTC-3)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (UTC+10/+11)" },
  { value: "Pacific/Auckland", label: "Pacific/Auckland (UTC+12/+13)" },
]

const THEME_OPTIONS = [
  { value: "light" as const, label: "Light", icon: Sun03Icon },
  { value: "dark" as const, label: "Dark", icon: Moon02Icon },
  { value: "system" as const, label: "System", icon: ComputerIcon },
]

function SystemSettingsCard() {
  const { theme, setTheme } = useTheme()
  const [timezone, setTimezone] = useState("Asia/Shanghai")
  const [timezoneLoading, setTimezoneLoading] = useState(true)
  const [timezoneSaving, setTimezoneSaving] = useState(false)

  useEffect(() => {
    void pb
      .send<{
        timezone: string
        theme: "light" | "dark" | "system"
      }>("/api/configs/system", {
        method: "GET",
        requestKey: null,
      })
      .then((config) => {
        setTimezone(config.timezone)
        setTheme(config.theme)
      })
      .catch(() => toast.error("Could not load the system timezone"))
      .finally(() => setTimezoneLoading(false))
  }, [setTheme])

  const updateTimezone = async (value: string) => {
    const previous = timezone
    setTimezone(value)
    setTimezoneSaving(true)
    try {
      const config = await pb.send<{
        timezone: string
        theme: "light" | "dark" | "system"
      }>("/api/configs/system", {
        method: "PATCH",
        body: { timezone: value },
      })
      setTimezone(config.timezone)
      toast.success("System timezone updated")
    } catch {
      setTimezone(previous)
      toast.error("Could not update the system timezone")
    } finally {
      setTimezoneSaving(false)
    }
  }

  const updateTheme = async (value: "light" | "dark" | "system") => {
    const previous = theme
    setTheme(value)
    try {
      const config = await pb.send<{
        timezone: string
        theme: "light" | "dark" | "system"
      }>("/api/configs/system", {
        method: "PATCH",
        body: { theme: value },
      })
      setTheme(config.theme)
    } catch {
      setTheme(previous)
      toast.error("Could not update the system theme")
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HugeiconsIcon
              icon={TimeZoneIcon}
              strokeWidth={2}
              className="size-4"
            />
          </div>
          <div>
            <CardTitle>System</CardTitle>
            <CardDescription>
              Configure your timezone and appearance preferences.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Timezone */}
        <div className="flex flex-col gap-2">
          <Label>Timezone</Label>
          <Select
            value={timezone}
            onValueChange={(value) => void updateTimezone(value)}
            disabled={timezoneLoading || timezoneSaving}
          >
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent>
              {COMMON_TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Used for calendar events, reminders, and AI scheduling.
          </p>
        </div>

        {/* Theme */}
        <div className="flex flex-col gap-2">
          <Label>Appearance</Label>
          <div className="flex gap-2">
            {THEME_OPTIONS.map((option) => {
              const active = theme === option.value
              const Icon = option.icon
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => void updateTheme(option.value)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/5 text-primary"
                      : "text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <HugeiconsIcon
                    icon={Icon}
                    strokeWidth={2}
                    className="size-4"
                  />
                  {option.label}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Choose how the interface looks. System follows your OS preference.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
