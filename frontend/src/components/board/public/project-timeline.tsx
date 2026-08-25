import { useEffect, useMemo, useRef } from "react"
import { isToday, isWeekend } from "date-fns"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  columnIndex,
  packLanes,
  placeSpan,
  taskSpan,
  timelineScale,
  type TimelineSpan,
} from "@/lib/timeline"
import { formatDate, type DateLocale } from "@/lib/date-format"
import type { PublicState, PublicTask } from "@/lib/public-board"
import { cn } from "@/lib/utils"

type ProjectTimelineProps = {
  range: TimelineSpan
  states: PublicState[]
  tasks: PublicTask[]
  locale: DateLocale
  onSelect: (task: PublicTask) => void
}

/**
 * The span layer: one horizontal date axis with a bar per task, grouped by
 * state and packed so rows reflect how much runs in parallel. It is a plain CSS
 * grid, which is all a read-only timeline needs — the bar's column start and
 * span are the two dates.
 */
export function ProjectTimeline({
  range,
  states,
  tasks,
  locale,
  onSelect,
}: ProjectTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const scale = useMemo(() => timelineScale(range), [range])

  const groups = useMemo(
    () =>
      states
        .map((state) => ({
          state,
          lanes: packLanes(
            tasks.filter((task) => task.stateId === state.id),
            taskSpan
          ),
        }))
        .filter((group) => group.lanes.length > 0),
    [states, tasks]
  )

  const todayColumn = useMemo(() => {
    const today = new Date()
    if (today < range.start || today > range.end) return null
    return columnIndex(today, range, scale)
  }, [range, scale])

  // Land the reader on today rather than at the beginning of a long project.
  useEffect(() => {
    const container = scrollRef.current
    if (!container || todayColumn === null) return
    container.scrollLeft = Math.max(
      todayColumn * scale.columnWidth - container.clientWidth / 3,
      0
    )
  }, [todayColumn, scale.columnWidth])

  const gridStyle = {
    gridTemplateColumns: `repeat(${scale.columns.length}, ${scale.columnWidth}px)`,
    width: scale.columns.length * scale.columnWidth,
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div
        ref={scrollRef}
        className="relative overflow-x-auto rounded-xl border border-border/60 bg-card"
      >
        <div className="min-w-full" style={{ width: gridStyle.width }}>
          <TimelineAxis scale={scale} gridStyle={gridStyle} locale={locale} />

          <div className="relative">
            {todayColumn !== null && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-primary/60"
                style={{ left: todayColumn * scale.columnWidth }}
              />
            )}
            {groups.map(({ state, lanes }) => (
              <div key={state.id} className="border-t border-border/40">
                <div className="sticky left-0 z-10 flex w-fit items-center gap-1.5 px-3 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: state.color }}
                  />
                  {state.name}
                  <span className="text-muted-foreground/70">
                    {state.taskCount}
                  </span>
                </div>
                <div className="pb-2">
                  {lanes.map((lane, index) => (
                    <div
                      key={index}
                      className="grid items-center gap-y-1 py-0.5"
                      style={gridStyle}
                    >
                      {lane.map((task) => (
                        <TimelineBar
                          key={task.id}
                          task={task}
                          state={state}
                          range={range}
                          scale={scale}
                          onSelect={onSelect}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

function TimelineAxis({
  scale,
  gridStyle,
  locale,
}: {
  scale: ReturnType<typeof timelineScale>
  gridStyle: { gridTemplateColumns: string; width: number }
  locale: DateLocale
}) {
  // Months span as many columns as they cover, so the axis reads as a calendar
  // rather than an undifferentiated run of days.
  const months: { label: string; span: number }[] = []
  for (const column of scale.columns) {
    const last = months[months.length - 1]
    const label = formatDate(column, "monthYear", locale)
    if (last && last.label === label) {
      last.span += 1
      continue
    }
    months.push({ label, span: 1 })
  }

  return (
    <div className="sticky top-0 z-20 bg-card/95 backdrop-blur">
      <div className="grid border-b border-border/40" style={gridStyle}>
        {months.map((month, index) => (
          <div
            key={`${month.label}-${index}`}
            className="truncate px-2 py-1 text-[11px] font-medium text-muted-foreground"
            style={{ gridColumn: `span ${month.span}` }}
          >
            {month.label}
          </div>
        ))}
      </div>
      <div className="grid border-b border-border/40" style={gridStyle}>
        {scale.columns.map((column) => (
          <div
            key={column.toISOString()}
            className={cn(
              "py-1 text-center text-[10px] leading-tight",
              isWeekend(column) && scale.unit === "day"
                ? "bg-muted/40 text-muted-foreground/70"
                : "text-muted-foreground",
              isToday(column) && "font-semibold text-primary"
            )}
          >
            {scale.unit === "week" ? (
              formatDate(column, "dayOfMonth", locale)
            ) : (
              <>
                <div>{formatDate(column, "weekdayNarrow", locale)}</div>
                <div>{formatDate(column, "dayOfMonth", locale)}</div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function TimelineBar({
  task,
  state,
  range,
  scale,
  onSelect,
}: {
  task: PublicTask
  state: PublicState
  range: TimelineSpan
  scale: ReturnType<typeof timelineScale>
  onSelect: (task: PublicTask) => void
}) {
  const span = taskSpan(task)
  if (!span) return null
  const placement = placeSpan(span, range, scale)
  const completed = state.category === "completed"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onSelect(task)}
          style={{
            gridColumn: `${placement.column} / span ${placement.span}`,
            backgroundColor: state.color,
          }}
          className={cn(
            "mx-0.5 flex h-6 min-w-0 items-center gap-1 rounded-sm px-1.5 text-left text-[11px] font-medium text-white transition-opacity hover:opacity-90",
            completed && "opacity-60"
          )}
        >
          {completed && <span aria-hidden>✓</span>}
          {scale.showBarLabels && (
            <span className="truncate">{task.title}</span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>{task.title}</TooltipContent>
    </Tooltip>
  )
}
