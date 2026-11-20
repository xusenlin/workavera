import { useEffect, useRef, useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Brain02Icon,
  CloudServerIcon,
  ComputerTerminal01Icon,
  InformationCircleIcon,
  Settings02Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatTokenCount } from "@/lib/chat-utils"
import { cn } from "@/lib/utils"
import { useChatRunsStore } from "@/store/chat-runs"
import {
  enabledMcpToolCount,
  useMcpServersStore,
  type McpServer,
} from "@/store/mcp-servers"
import { useMemoriesStore } from "@/store/memories"
import { usePreferencesStore } from "@/store/preferences"
import { useSandboxStore, type SandboxStatus } from "@/store/sandbox"
import type { Conversation } from "@/types/chat"

const SANDBOX_UNAVAILABLE_REASONS: Record<string, string> = {
  disabled_by_admin: "An administrator has turned the sandbox off.",
  in_container: "Sandbox is unavailable while Workavera runs in a container.",
  docker_missing: "Docker was not found on the host.",
  daemon_unreachable: "Workavera cannot reach the Docker daemon.",
  daemon_not_linux: "Docker must run in Linux container mode.",
}

const SANDBOX_PHASE_LABELS: Record<string, string> = {
  pulling_image: "Pulling image",
  creating: "Creating container",
  starting: "Starting container",
}

function ConversationStatsSection({
  conversation,
}: {
  conversation: Conversation
}) {
  return (
    <section className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <HugeiconsIcon
            icon={InformationCircleIcon}
            strokeWidth={2}
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            Stats
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1 px-1 text-xs tabular-nums">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span>
            <span className="font-medium text-foreground">
              {conversation.message_count}
            </span>{" "}
            <span className="text-muted-foreground">
              {conversation.message_count === 1 ? "message" : "messages"}
            </span>
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span>
            <span className="font-medium text-foreground">
              {conversation.tool_call_count}
            </span>{" "}
            <span className="text-muted-foreground">
              {conversation.tool_call_count === 1 ? "tool call" : "tool calls"}
            </span>
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/85">
            {formatTokenCount(conversation.input_tokens)}
          </span>{" "}
          in <span className="text-muted-foreground/45">/</span>{" "}
          <span className="font-medium text-foreground/85">
            {formatTokenCount(conversation.output_tokens)}
          </span>{" "}
          out tokens
        </div>
      </div>
    </section>
  )
}

function serverStatusMeta(server: McpServer, toolCount: number) {
  if (server.lastError) {
    return {
      dotClass: "bg-destructive",
      label: "Error",
      labelClass: "text-destructive",
      tooltip: server.lastError,
    }
  }
  if (server.tools.some((tool) => tool.stale)) {
    return {
      dotClass: "bg-amber-500",
      label: "Refresh",
      labelClass: "text-amber-600 dark:text-amber-500",
      tooltip: "A call failed; refresh this server in Settings",
    }
  }
  if (toolCount === 0) {
    return {
      dotClass: "bg-muted-foreground/30",
      label: "No tools",
      labelClass: "text-muted-foreground/70",
      tooltip: "Select at least one tool in Settings to enable",
    }
  }
  if (server.enabled) {
    return {
      dotClass: "bg-emerald-500",
      label: `${toolCount} ${toolCount === 1 ? "tool" : "tools"}`,
      labelClass: "text-muted-foreground",
    }
  }
  return {
    dotClass: "bg-muted-foreground/30",
    label: `${toolCount} ${toolCount === 1 ? "tool" : "tools"}`,
    labelClass: "text-muted-foreground/70",
  }
}

function McpServersSection() {
  const servers = useMcpServersStore((state) => state.servers)
  const loading = useMcpServersStore((state) => state.loading)
  const initialized = useMcpServersStore((state) => state.initialized)
  const error = useMcpServersStore((state) => state.error)
  const togglingIds = useMcpServersStore((state) => state.togglingIds)
  const loadServers = useMcpServersStore((state) => state.loadServers)
  const toggleServer = useMcpServersStore((state) => state.toggleServer)

  useEffect(() => {
    void loadServers(true)
  }, [loadServers])

  const activeCount = servers.filter(
    (server) => server.enabled && enabledMcpToolCount(server) > 0
  ).length

  return (
    <section className="flex flex-col gap-1.5 p-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <HugeiconsIcon
            icon={CloudServerIcon}
            strokeWidth={2}
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            MCP
          </span>
          {initialized && servers.length > 0 && (
            <span
              className={cn(
                "rounded-full px-1.5 py-px text-[10px] font-medium tabular-nums",
                activeCount > 0
                  ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {activeCount}/{servers.length}
            </span>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              asChild
              className="text-muted-foreground/80 hover:text-foreground"
            >
              <Link to="/settings" aria-label="Manage MCP servers">
                <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Manage MCP servers</TooltipContent>
        </Tooltip>
      </div>

      {loading && !initialized ? (
        <div className="flex flex-col gap-1 px-1 py-0.5">
          {[0, 1].map((item) => (
            <div
              key={item}
              className="flex h-7 items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2">
                <Skeleton className="size-1.5 rounded-full" />
                <Skeleton className="h-3.5 w-24" />
              </div>
              <Skeleton className="h-3.5 w-6 rounded-full" />
            </div>
          ))}
        </div>
      ) : error && servers.length === 0 ? (
        <div className="flex items-center justify-between gap-2 px-1 py-1 text-xs text-muted-foreground">
          <span className="truncate">{error}</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => void loadServers(true)}
          >
            Retry
          </Button>
        </div>
      ) : servers.length === 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs text-muted-foreground">
          <span>No servers yet</span>
          <Link
            to="/settings"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Add
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {servers.map((server) => {
            const toolCount = enabledMcpToolCount(server)
            const status = serverStatusMeta(server, toolCount)
            const checked = server.enabled && toolCount > 0
            const disabled = toolCount === 0 || Boolean(togglingIds[server.id])

            return (
              <div
                key={server.id}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      status.dotClass
                    )}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-xs font-medium",
                      !checked && "text-foreground/80"
                    )}
                    title={server.name}
                  >
                    {server.name}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {status.tooltip ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className={cn(
                            "cursor-default text-[11px] tabular-nums",
                            status.labelClass
                          )}
                        >
                          {status.label}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-56">
                        {status.tooltip}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span
                      className={cn(
                        "text-[11px] tabular-nums",
                        status.labelClass
                      )}
                    >
                      {status.label}
                    </span>
                  )}
                  <Switch
                    size="sm"
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={(next) =>
                      void toggleServer(server.id, next)
                    }
                    aria-label={`Toggle ${server.name}`}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function MemorySection() {
  const preferences = usePreferencesStore((state) => state.preferences)
  const updateMemoryEnabled = usePreferencesStore(
    (state) => state.updateMemoryEnabled
  )
  const updateMemoryAutoCapture = usePreferencesStore(
    (state) => state.updateMemoryAutoCapture
  )
  const memories = useMemoriesStore((state) => state.memories)
  const memoriesInitialized = useMemoriesStore((state) => state.initialized)
  const initializeMemories = useMemoriesStore((state) => state.initialize)
  const [updatingEnabled, setUpdatingEnabled] = useState(false)
  const [updatingAuto, setUpdatingAuto] = useState(false)

  useEffect(() => {
    void initializeMemories()
  }, [initializeMemories])

  const memoryEnabled = preferences?.memoryEnabled ?? false
  const memoryAutoCapture = preferences?.memoryAutoCapture ?? false
  const activeMemories = memories.filter((memory) => memory.active).length

  const handleToggleEnabled = async (checked: boolean) => {
    setUpdatingEnabled(true)
    try {
      await updateMemoryEnabled(checked)
    } catch {
      toast.error("Could not update Chat memory")
    } finally {
      setUpdatingEnabled(false)
    }
  }

  const handleToggleAuto = async (checked: boolean) => {
    setUpdatingAuto(true)
    try {
      await updateMemoryAutoCapture(checked)
    } catch {
      toast.error("Could not update automatic memory")
    } finally {
      setUpdatingAuto(false)
    }
  }

  return (
    <section className="flex flex-col gap-1.5 p-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <HugeiconsIcon
            icon={Brain02Icon}
            strokeWidth={2}
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            Memory
          </span>
          {memoriesInitialized && (
            <span
              className={cn(
                "rounded-full px-1.5 py-px text-[10px] font-medium tabular-nums",
                memoryEnabled && activeMemories > 0
                  ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {activeMemories}
            </span>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              asChild
              className="text-muted-foreground/80 hover:text-foreground"
            >
              <Link to="/settings?manage=memory" aria-label="Manage memories">
                <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Manage memories</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                memoryEnabled ? "bg-emerald-500" : "bg-muted-foreground/30"
              )}
            />
            <span
              className={cn(
                "truncate text-xs font-medium",
                !memoryEnabled && "text-foreground/80"
              )}
            >
              Long-term memory
            </span>
          </div>
          <Switch
            size="sm"
            checked={memoryEnabled}
            disabled={!preferences || updatingEnabled}
            onCheckedChange={(next) => void handleToggleEnabled(next)}
            aria-label="Toggle long-term memory"
          />
        </div>

        <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                memoryEnabled && memoryAutoCapture
                  ? "bg-emerald-500"
                  : "bg-muted-foreground/30"
              )}
            />
            <span
              className={cn(
                "truncate text-xs font-medium",
                !(memoryEnabled && memoryAutoCapture) && "text-foreground/80"
              )}
            >
              Auto capture
            </span>
          </div>
          <Switch
            size="sm"
            checked={memoryEnabled && memoryAutoCapture}
            disabled={!preferences || !memoryEnabled || updatingAuto}
            onCheckedChange={(next) => void handleToggleAuto(next)}
            aria-label="Toggle automatic memory capture"
          />
        </div>
      </div>
    </section>
  )
}

function sandboxBadgeMeta(status: SandboxStatus) {
  if (!status.available) {
    return {
      label: "Unavailable",
      className: "bg-muted text-muted-foreground",
      tooltip:
        SANDBOX_UNAVAILABLE_REASONS[status.reason] ??
        status.message ??
        "The sandbox is not available on this server.",
    }
  }
  if (!status.enabled) {
    return {
      label: "Off",
      className: "bg-muted text-muted-foreground",
    }
  }
  switch (status.container.state) {
    case "running":
      return {
        label: "Running",
        className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
      }
    case "preparing":
      return {
        label: "Preparing",
        className: "bg-amber-500/12 text-amber-700 dark:text-amber-400",
        spinning: true,
        tooltip: SANDBOX_PHASE_LABELS[status.container.phase] ?? "Preparing",
      }
    case "error":
      return {
        label: "Error",
        className: "bg-destructive/12 text-destructive",
        tooltip: status.container.error || "Sandbox container error",
      }
    default:
      return {
        label: "Stopped",
        className: "bg-muted text-muted-foreground",
      }
  }
}

function SandboxSection() {
  const status = useSandboxStore((state) => state.status)
  const loading = useSandboxStore((state) => state.loading)
  const error = useSandboxStore((state) => state.error)
  const busy = useSandboxStore((state) => state.busy)
  const load = useSandboxStore((state) => state.load)
  const toggleEnabled = useSandboxStore((state) => state.toggleEnabled)
  const toggleOnline = useSandboxStore((state) => state.toggleOnline)
  const hasActiveRun = useChatRunsStore(
    (state) => Object.keys(state.runs).length > 0
  )
  const prevActiveRunRef = useRef(hasActiveRun)

  useEffect(() => {
    void load(true)
  }, [load])

  useEffect(() => {
    if (prevActiveRunRef.current && !hasActiveRun) {
      void load(true)
    }
    prevActiveRunRef.current = hasActiveRun
  }, [hasActiveRun, load])

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void load(true)
      }
    }
    window.addEventListener("focus", refreshIfVisible)
    document.addEventListener("visibilitychange", refreshIfVisible)
    return () => {
      window.removeEventListener("focus", refreshIfVisible)
      document.removeEventListener("visibilitychange", refreshIfVisible)
    }
  }, [load])

  const preparing = status?.container.state === "preparing"
  const activeSandbox = Boolean(status?.available && status.enabled)
  const pollIntervalMs = preparing
    ? 2000
    : hasActiveRun && activeSandbox
      ? 3000
      : 15000

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load(true)
      }
    }, pollIntervalMs)
    return () => window.clearInterval(timer)
  }, [load, pollIntervalMs])

  const badge = status ? sandboxBadgeMeta(status) : null

  return (
    <section className="flex flex-col gap-1.5 p-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <HugeiconsIcon
            icon={ComputerTerminal01Icon}
            strokeWidth={2}
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            Sandbox
          </span>
          {badge &&
            (badge.tooltip ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "inline-flex cursor-default items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium",
                      badge.className
                    )}
                  >
                    {badge.spinning && <Spinner className="size-2.5" />}
                    {badge.label}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-56">
                  {badge.tooltip}
                </TooltipContent>
              </Tooltip>
            ) : (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium",
                  badge.className
                )}
              >
                {badge.label}
              </span>
            ))}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              asChild
              className="text-muted-foreground/80 hover:text-foreground"
            >
              <Link to="/settings" aria-label="Manage sandbox">
                <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Manage sandbox</TooltipContent>
        </Tooltip>
      </div>

      {loading && !status ? (
        <div className="flex h-7 items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <Skeleton className="size-1.5 rounded-full" />
            <Skeleton className="h-3.5 w-24" />
          </div>
          <Skeleton className="h-3.5 w-6 rounded-full" />
        </div>
      ) : error && !status ? (
        <div className="flex items-center justify-between gap-2 px-1 py-1 text-xs text-muted-foreground">
          <span className="truncate">{error}</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => void load(true)}
          >
            Retry
          </Button>
        </div>
      ) : status ? (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  !status.available
                    ? "bg-muted-foreground/30"
                    : status.enabled && status.container.state === "error"
                      ? "bg-destructive"
                      : status.enabled && status.container.state === "preparing"
                        ? "bg-amber-500"
                        : status.enabled
                          ? "bg-emerald-500"
                          : "bg-muted-foreground/30"
                )}
              />
              <span
                className={cn(
                  "truncate text-xs font-medium",
                  !(status.available && status.enabled) && "text-foreground/80"
                )}
              >
                Enable sandbox
              </span>
            </div>
            <Switch
              size="sm"
              checked={status.available && status.enabled}
              disabled={!status.available || busy !== null}
              onCheckedChange={(next) => void toggleEnabled(next)}
              aria-label="Toggle sandbox"
            />
          </div>

          {status.available && status.enabled && (
            <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    status.networkAllowed && status.online
                      ? "bg-emerald-500"
                      : "bg-muted-foreground/30"
                  )}
                />
                <span
                  className={cn(
                    "truncate text-xs font-medium",
                    !(status.networkAllowed && status.online) &&
                      "text-foreground/80"
                  )}
                >
                  Network access
                </span>
              </div>
              <Switch
                size="sm"
                checked={status.networkAllowed && status.online}
                disabled={!status.networkAllowed || busy !== null}
                title={
                  !status.networkAllowed
                    ? "Disabled by administrator"
                    : undefined
                }
                onCheckedChange={(next) => void toggleOnline(next)}
                aria-label="Toggle sandbox network access"
              />
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}

export function ChatSidePanel({
  conversation,
  className,
}: {
  conversation: Conversation
  className?: string
}) {
  return (
    <aside
      aria-label="Chat panel"
      className={cn(
        "flex h-full w-64 shrink-0 flex-col border-l bg-sidebar/50 text-foreground max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-20 max-lg:bg-sidebar max-lg:shadow-lg",
        className
      )}
    >
      <div className="divide-y divide-border/70 overflow-y-auto">
        <ConversationStatsSection conversation={conversation} />
        <McpServersSection />
        <MemorySection />
        <SandboxSection />
      </div>
    </aside>
  )
}
