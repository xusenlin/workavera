import * as React from "react"
import * as RechartsPrimitive from "recharts"

import { cn } from "@/lib/utils"

// Format: { theme: e.g. "theme1", color: e.g. "var(--chart-1)" }
type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode
    icon?: React.ComponentType
    color?: string
  }
>

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }
  return context
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >["children"]
}) {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart-container"
        className={cn(
          "flex aspect-video justify-center text-xs",
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground",
          "[&_.recharts-cartesian-grid_line]:stroke-border/70",
          "[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border",
          "[&_.recharts-polar-grid_.recharts-polar-grid-angle-line]:stroke-border",
          "[&_.recharts-polar-grid_.recharts-polar-grid-radial-line]:stroke-border",
          "[&_.recharts-radial-bar-background-sector]:fill-muted",
          "[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted/40",
          "[&_.recharts-reference-line_line]:stroke-border",
          "[&_.recharts-sector[stroke='none']]:fill-muted",
          "[&_.recharts-sector]:stroke-border",
          "[&_.recharts-surface]:outline-none",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer
          id={chartId}
          className="size-full"
        >
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(
    ([, config]) => config.color
  )

  if (!colorConfig.length) {
    return null
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: colorConfig
          .map(
            ([key, itemConfig]) => `
#${id} [data-chart="${key}"] {
  --color: ${itemConfig.color};
}
`
          )
          .join("\n"),
      }}
    />
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  ...props
}: React.ComponentProps<typeof RechartsPrimitive.Toolbox> &
  RechartsPrimitive.TooltipProps & {
    hideLabel?: boolean
    indicator?: "line" | "dot" | "dashed"
  }) {
  const { config } = useChart()

  if (!active || !payload?.length) {
    return null
  }

  const nestLabel = props.label

  return (
    <div
      className={cn(
        "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
        className
      )}
    >
      {!nestLabel ? null : hideLabel ? null : (
        <div className="font-medium text-foreground">
          {nestLabel}
        </div>
      )}
      <div className="grid gap-1.5">
        {payload.map((item) => {
          const itemConfig = config[item.dataKey as string]
          if (!itemConfig) return null

          return (
            <div
              key={item.dataKey}
              className="flex w-full flex-wrap items-stretch gap-2"
              data-chart={item.dataKey}
            >
              {indicator === "dot" ? (
                <div
                  className="size-2.5 shrink-0 rounded-[2px]"
                  style={{
                    backgroundColor: item.color,
                  }}
                />
              ) : null}
              {indicator === "line" ? (
                <div
                  className="w-1 shrink-0 rounded-[2px]"
                  style={{
                    backgroundColor: item.color,
                  }}
                />
              ) : null}
              {indicator === "dashed" ? (
                <div
                  className="w-1 shrink-0 border-r border-dashed"
                  style={{
                    borderColor: item.color,
                  }}
                />
              ) : null}
              <div className="flex flex-1 grow items-center justify-between gap-2 leading-none">
                <div className="grid gap-1.5">
                  <span className="text-muted-foreground">
                    {itemConfig.label}
                  </span>
                </div>
                <span className="font-mono font-medium tabular-nums text-foreground">
                  {item.value as React.ReactNode}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ChartLegend = RechartsPrimitive.Legend

function ChartLegendContent({
  className,
  ...props
}: React.ComponentProps<"div"> & {
  payload?: Array<{ value?: string; color?: string }>
  verticalAlign?: "top" | "bottom"
  nameKey?: string
}) {
  const { config } = useChart()

  if (!props.payload?.length) {
    return null
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4",
        props.verticalAlign === "top" ? "pb-3" : "pt-3",
        className
      )}
    >
      {props.payload.map((entry, index) => {
        const itemConfig = config[entry.value as string]
        if (!itemConfig) return null

        return (
          <div
            key={`item-${index}`}
            className="flex items-center gap-1.5"
            data-chart={entry.value}
          >
            <div
              className="size-2 shrink-0 rounded-[2px]"
              style={{
                backgroundColor: entry.color,
              }}
            />
            <span className="text-muted-foreground">
              {itemConfig.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
  type ChartConfig,
}
