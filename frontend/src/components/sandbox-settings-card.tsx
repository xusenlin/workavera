import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { HugeiconsIcon } from "@hugeicons/react"
import { ComputerTerminal01Icon } from "@hugeicons/core-free-icons"

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
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { extractErrorMessage } from "@/lib/error"
import { pb } from "@/lib/pocketbase"
import { useSandboxStore } from "@/store/sandbox"

const README_SANDBOX_URL =
  "https://github.com/xusenlin/workavera/blob/main/README.md#sandbox"

type SandboxState =
  "unavailable" | "disabled" | "preparing" | "running" | "stopped" | "error"

type SandboxStatus = {
  available: boolean
  reason: string
  message: string
  enabled: boolean
  online: boolean
  networkAllowed: boolean
  configuredImage: string
  limits: { memory: string; cpus: number; pids: number }
  idleTimeoutMinutes: number
  container: {
    name: string
    state: SandboxState
    phase: string
    image: string
    createdAt: string
    error: string
  }
}

const UNAVAILABLE_REASONS: Record<string, string> = {
  disabled_by_admin: "An administrator has turned the sandbox off.",
  in_container:
    "Workavera runs in a container, where the sandbox is not supported for security reasons. To use it, run the Workavera binary directly on the host.",
  docker_missing:
    "The docker command was not found. Install Docker on the host first.",
  daemon_unreachable:
    "Workavera cannot reach Docker. Make sure Docker is running and that the system user running Workavera may access it.",
  daemon_not_linux: "Docker must run in Linux container mode.",
}

const PHASE_LABELS: Record<string, string> = {
  pulling_image: "pulling image",
  creating: "creating container",
  starting: "starting container",
}

function formatIdle(minutes: number) {
  if (minutes === 0) return "Never"
  if (minutes % 60 === 0) {
    const hours = minutes / 60
    return `After ${hours} ${hours === 1 ? "hour" : "hours"} idle`
  }
  return `After ${minutes} minutes idle`
}

function formatMemory(memory: string) {
  const match = /^(\d+)([kmg])$/i.exec(memory)
  if (!match) return memory
  return `${match[1]} ${match[2].toUpperCase()}B`
}

export function SandboxSettingsCard() {
  const [status, setStatus] = useState<SandboxStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const load = useCallback(async () => {
    try {
      const next = await pb.send<SandboxStatus>("/api/sandbox", {
        requestKey: null,
      })
      setStatus(next)
      useSandboxStore.getState().setStatus(next)
      setLoadError(null)
    } catch (error) {
      setLoadError(extractErrorMessage(error, "Could not load the sandbox"))
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(() => load())
  }, [load])

  const preparing = status?.container.state === "preparing"
  useEffect(() => {
    if (!preparing) return
    const timer = window.setInterval(() => void load(), 2000)
    return () => window.clearInterval(timer)
  }, [load, preparing])

  const run = async (
    action: string,
    path: string,
    failure: string,
    body?: Record<string, unknown>
  ) => {
    setBusy(action)
    try {
      const next = await pb.send<SandboxStatus>(path, {
        method: "POST",
        body,
        requestKey: null,
      })
      setStatus(next)
      useSandboxStore.getState().setStatus(next)
      return true
    } catch (error) {
      toast.error(extractErrorMessage(error, failure))
      void load()
      return false
    } finally {
      setBusy(null)
    }
  }

  const toggleEnabled = (checked: boolean) =>
    void run(
      "enabled",
      checked ? "/api/sandbox/enable" : "/api/sandbox/disable",
      checked ? "Could not turn the sandbox on" : "Could not turn it off"
    )

  const toggleOnline = (checked: boolean) =>
    void run("network", "/api/sandbox/network", "Could not change network", {
      online: checked,
    })

  const rebuild = () =>
    void run("rebuild", "/api/sandbox/rebuild", "Could not rebuild")

  const reset = async () => {
    if (
      await run("reset", "/api/sandbox/reset", "Could not reset the workspace")
    ) {
      setConfirmReset(false)
      toast.success("Workspace reset")
    }
  }

  const container = status?.container
  const imageMismatch =
    !!container?.image && container.image !== status?.configuredImage

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <HugeiconsIcon
                icon={ComputerTerminal01Icon}
                strokeWidth={2}
                className="size-4"
              />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle>Sandbox</CardTitle>
              <CardDescription>
                A Linux container of your own where Chat can run commands and
                work on files.
              </CardDescription>
            </div>
            {status?.available && status.enabled && container && (
              <SandboxStateBadge
                state={container.state}
                phase={container.phase}
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {!status ? (
            loadError ? (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-destructive">{loadError}</p>
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  Retry
                </Button>
              </div>
            ) : (
              <Skeleton className="h-10 w-full" />
            )
          ) : (
            <>
              <SettingRow
                id="sandbox-enabled"
                label="Enable sandbox"
                description="Creates a separate container for you in which the assistant can run commands and process files. Files in /workspace are kept across conversations."
              >
                <Switch
                  id="sandbox-enabled"
                  checked={status.available && status.enabled}
                  disabled={!status.available || busy !== null}
                  onCheckedChange={toggleEnabled}
                />
              </SettingRow>

              {!status.available && (
                <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  <p>
                    {UNAVAILABLE_REASONS[status.reason] ??
                      "The sandbox is not available on this server."}
                    {status.reason === "in_container" && (
                      <>
                        {" "}
                        <a
                          href={README_SANDBOX_URL}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          Learn more
                        </a>
                      </>
                    )}
                  </p>
                  {status.message && (
                    <p className="mt-2 font-mono text-xs break-all">
                      {status.message}
                    </p>
                  )}
                </div>
              )}

              {status.available && status.enabled && container && (
                <>
                  {container.state === "error" && (
                    <div className="flex items-start justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                      <p className="min-w-0 font-mono text-xs break-all text-destructive">
                        {container.error}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy !== null}
                        onClick={rebuild}
                      >
                        {busy === "rebuild" && <Spinner />}
                        Retry
                      </Button>
                    </div>
                  )}

                  <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Container</dt>
                    <dd className="min-w-0 font-mono text-xs leading-5 break-all">
                      {container.name}
                    </dd>
                    <dt className="text-muted-foreground">Image</dt>
                    <dd className="min-w-0 font-mono text-xs leading-5 break-all">
                      {status.configuredImage}
                    </dd>
                    <dt className="text-muted-foreground">Limits</dt>
                    <dd>
                      {formatMemory(status.limits.memory)} memory ·{" "}
                      {status.limits.cpus}{" "}
                      {status.limits.cpus === 1 ? "CPU" : "CPUs"} ·{" "}
                      {status.limits.pids} processes
                    </dd>
                    <dt className="text-muted-foreground">Auto stop</dt>
                    <dd>{formatIdle(status.idleTimeoutMinutes)}</dd>
                  </dl>

                  {imageMismatch && (
                    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                      <p className="min-w-0 text-sm text-muted-foreground">
                        The container uses{" "}
                        <span className="font-mono text-xs break-all">
                          {container.image}
                        </span>
                        . Rebuild it to use{" "}
                        <span className="font-mono text-xs break-all">
                          {status.configuredImage}
                        </span>
                        ; files in /workspace are kept.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy !== null || preparing}
                        onClick={rebuild}
                      >
                        {busy === "rebuild" && <Spinner />}
                        Rebuild
                      </Button>
                    </div>
                  )}

                  <SettingRow
                    id="sandbox-online"
                    label="Allow network access"
                    description={
                      status.networkAllowed
                        ? "When off, the assistant cannot install dependencies or download anything."
                        : "An administrator has turned off sandbox network access."
                    }
                  >
                    <Switch
                      id="sandbox-online"
                      checked={status.networkAllowed && status.online}
                      disabled={!status.networkAllowed || busy !== null}
                      onCheckedChange={toggleOnline}
                    />
                  </SettingRow>

                  <SettingRow
                    id="sandbox-reset"
                    label="Reset workspace"
                    description="Permanently deletes every file in /workspace and recreates the container."
                  >
                    <Button
                      id="sandbox-reset"
                      variant="destructive"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => setConfirmReset(true)}
                    >
                      Reset
                    </Button>
                  </SettingRow>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={confirmReset}
        onOpenChange={(open) => {
          if (busy !== "reset") setConfirmReset(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset the workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              Every file in /workspace is deleted permanently and cannot be
              recovered. Files you exported to Resources or Docs are not
              affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "reset"}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy === "reset"}
              onClick={(event) => {
                event.preventDefault()
                void reset()
              }}
            >
              {busy === "reset" && <Spinner />}
              Reset workspace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function SandboxStateBadge({
  state,
  phase,
}: {
  state: SandboxState
  phase: string
}) {
  switch (state) {
    case "preparing":
      return (
        <Badge variant="secondary">
          <Spinner />
          Preparing{PHASE_LABELS[phase] ? ` (${PHASE_LABELS[phase]})` : ""}
        </Badge>
      )
    case "running":
      return <Badge>Running</Badge>
    case "stopped":
      return (
        <Badge variant="outline" title="Starts automatically on next use">
          Stopped
        </Badge>
      )
    case "error":
      return <Badge variant="destructive">Error</Badge>
    default:
      return null
  }
}

function SettingRow({
  id,
  label,
  description,
  children,
}: {
  id: string
  label: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}
