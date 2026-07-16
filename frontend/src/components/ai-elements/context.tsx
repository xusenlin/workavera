"use client"

// Trimmed from Vercel AI Elements' Context component: cost estimation
// (tokenlens) is removed because models here point at user-configured
// endpoints without reliable pricing, and the usage shape matches this app's
// message metadata (cacheReadTokens/cacheCreationTokens) instead of the AI
// SDK's cachedInputTokens.
import type { ComponentProps } from "react"
import { createContext, useContext } from "react"

import { Button } from "@/components/ui/button"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

const PERCENT_MAX = 100
const ICON_RADIUS = 10
const ICON_VIEWBOX = 24
const ICON_CENTER = 12
const ICON_STROKE_WIDTH = 2

export type ContextUsage = {
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
}

type ContextSchema = {
  usedTokens: number
  maxTokens: number
  usage?: ContextUsage
  /** usedTokens is an estimate; rendered values get a "~" prefix. */
  estimated?: boolean
  /** Conversation-wide accumulated usage across every run. */
  totals?: {
    inputTokens: number
    outputTokens: number
  }
}

const ContextContext = createContext<ContextSchema | null>(null)

const useContextValue = () => {
  const context = useContext(ContextContext)
  if (!context) {
    throw new Error("Context components must be used within Context")
  }
  return context
}

const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact" })

function formatPercent(usedTokens: number, maxTokens: number) {
  if (maxTokens <= 0) return "—"
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(usedTokens / maxTokens)
}

export type ContextProps = ComponentProps<typeof HoverCard> & ContextSchema

export const Context = ({
  usedTokens,
  maxTokens,
  usage,
  estimated,
  totals,
  ...props
}: ContextProps) => (
  <ContextContext.Provider
    value={{ usedTokens, maxTokens, usage, estimated, totals }}
  >
    <HoverCard closeDelay={0} openDelay={0} {...props} />
  </ContextContext.Provider>
)

const ContextIcon = () => {
  const { usedTokens, maxTokens } = useContextValue()
  const circumference = 2 * Math.PI * ICON_RADIUS
  const usedPercent = maxTokens > 0 ? Math.min(usedTokens / maxTokens, 1) : 0
  const dashOffset = circumference * (1 - usedPercent)

  return (
    <svg
      aria-label="Model context usage"
      height="20"
      role="img"
      style={{ color: "currentcolor" }}
      viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
      width="20"
    >
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity="0.25"
        r={ICON_RADIUS}
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
      />
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity="0.7"
        r={ICON_RADIUS}
        stroke="currentColor"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        strokeWidth={ICON_STROKE_WIDTH}
        style={{ transformOrigin: "center", transform: "rotate(-90deg)" }}
      />
    </svg>
  )
}

export type ContextTriggerProps = ComponentProps<typeof Button>

export const ContextTrigger = ({ children, ...props }: ContextTriggerProps) => {
  const { usedTokens, maxTokens, estimated } = useContextValue()

  return (
    <HoverCardTrigger asChild>
      {children ?? (
        <Button type="button" variant="ghost" {...props}>
          <span className="font-medium text-muted-foreground">
            {estimated ? "~" : ""}
            {formatPercent(usedTokens, maxTokens)}
          </span>
          <ContextIcon />
        </Button>
      )}
    </HoverCardTrigger>
  )
}

export type ContextContentProps = ComponentProps<typeof HoverCardContent>

export const ContextContent = ({
  className,
  ...props
}: ContextContentProps) => (
  <HoverCardContent
    className={cn("min-w-60 divide-y overflow-hidden p-0", className)}
    {...props}
  />
)

export type ContextContentHeaderProps = ComponentProps<"div">

export const ContextContentHeader = ({
  children,
  className,
  ...props
}: ContextContentHeaderProps) => {
  const { usedTokens, maxTokens, estimated } = useContextValue()
  const usedPercent = maxTokens > 0 ? Math.min(usedTokens / maxTokens, 1) : 0
  const prefix = estimated ? "~" : ""

  return (
    <div className={cn("w-full space-y-2 p-3", className)} {...props}>
      {children ?? (
        <>
          <div className="flex items-center justify-between gap-3 text-xs">
            <p>
              {prefix}
              {formatPercent(usedTokens, maxTokens)}
            </p>
            <p className="font-mono text-muted-foreground">
              {prefix}
              {compactNumber.format(usedTokens)}
              {maxTokens > 0 ? ` / ${compactNumber.format(maxTokens)}` : ""}
            </p>
          </div>
          <Progress className="bg-muted" value={usedPercent * PERCENT_MAX} />
        </>
      )}
    </div>
  )
}

export type ContextContentBodyProps = ComponentProps<"div">

export const ContextContentBody = ({
  children,
  className,
  ...props
}: ContextContentBodyProps) => (
  <div className={cn("w-full p-3", className)} {...props}>
    {children}
  </div>
)

const UsageRow = ({
  label,
  tokens,
  unknown = false,
}: {
  label: string
  tokens?: number
  /** The provider did not report this value; render "~" instead of a number. */
  unknown?: boolean
}) => (
  <div className="flex items-center justify-between text-xs">
    <span className="text-muted-foreground">{label}</span>
    <span>{unknown ? "~" : compactNumber.format(tokens ?? 0)}</span>
  </div>
)

export const ContextCacheUsage = () => {
  const { usage, estimated } = useContextValue()
  if (!usage) return null
  return (
    <UsageRow label="Cache hit" tokens={usage.cacheReadTokens} unknown={estimated} />
  )
}

export const ContextCacheCreationUsage = () => {
  const { usage, estimated } = useContextValue()
  if (!usage) return null
  return (
    <UsageRow
      label="Cache write"
      tokens={usage.cacheCreationTokens}
      unknown={estimated}
    />
  )
}

export const ContextTotalsUsage = () => {
  const { totals } = useContextValue()
  if (!totals) return null
  // An accumulated input of 0 alongside real output means the provider never
  // reported input usage, not that nothing was sent.
  const inputUnknown = totals.inputTokens === 0 && totals.outputTokens > 0
  return (
    <>
      <UsageRow
        label="Total input"
        tokens={totals.inputTokens}
        unknown={inputUnknown}
      />
      <UsageRow label="Total output" tokens={totals.outputTokens} />
    </>
  )
}

export const ContextCompactionThreshold = ({
  threshold = 0.75,
}: {
  threshold?: number
}) => {
  const { maxTokens } = useContextValue()
  if (maxTokens <= 0) return null
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">Compacts at</span>
      <span>
        {compactNumber.format(Math.round(maxTokens * threshold))} (
        {Math.round(threshold * 100)}%)
      </span>
    </div>
  )
}
