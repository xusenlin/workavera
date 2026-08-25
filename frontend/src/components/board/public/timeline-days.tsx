import { useMemo, useState, type ReactNode } from "react"
import { isToday } from "date-fns"

import { TaskCardContent } from "@/components/board/task-card-content"
import { formatDate, type DateLocale } from "@/lib/date-format"
import {
  dayOfSpan,
  spanCoversDay,
  taskSpan,
  timelineDays,
  type TimelineSpan,
} from "@/lib/timeline"
import type { PublicState, PublicTask } from "@/lib/public-board"
import { cn } from "@/lib/utils"

type TimelineDaysProps = {
  range: TimelineSpan
  states: PublicState[]
  tasks: PublicTask[]
  locale: DateLocale
  onSelect: (task: PublicTask) => void
}

type DayEntry = {
  task: PublicTask
  /** The first day of a span shows the full card, later days a compact row. */
  first: boolean
  day: number
  total: number
}

/** Two rows on a wide screen: enough to read a busy day without scrolling it. */
const MAX_VISIBLE_TASKS = 6

/**
 * A day's tasks, folded once there are more than a screenful. A single busy day
 * would otherwise push the days after it far down the page.
 */
function TaskGrid({ items }: { items: ReactNode[] }) {
  const [expanded, setExpanded] = useState(false)
  const hidden = items.length - MAX_VISIBLE_TASKS
  const visible = expanded || hidden <= 0 ? items : items.slice(0, MAX_VISIBLE_TASKS)

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{visible}</div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? "Show less" : `+${hidden} more`}
        </button>
      )}
    </>
  )
}

/**
 * The day-by-day layer answers "what is happening on this day". A task appears
 * on every day its span covers, in full on the first and compactly afterwards,
 * so a long task neither disappears after its start nor repeats at full size.
 */
export function TimelineDays({
  range,
  states,
  tasks,
  locale,
  onSelect,
}: TimelineDaysProps) {
  const completedStates = useMemo(
    () =>
      new Set(
        states
          .filter((state) => state.category === "completed")
          .map((state) => state.id)
      ),
    [states]
  )
  const stateById = useMemo(
    () => new Map(states.map((state) => [state.id, state])),
    [states]
  )

  const days = useMemo(() => {
    const spans = tasks.map((task) => ({ task, span: taskSpan(task) }))
    return timelineDays(range).map((date) => {
      const entries: DayEntry[] = []
      for (const { task, span } of spans) {
        if (!span || !spanCoversDay(span, date)) continue
        const position = dayOfSpan(span, date)
        entries.push({
          task,
          first: position.day === 1,
          day: position.day,
          total: position.total,
        })
      }
      return { date, entries }
    })
  }, [range, tasks])

  const unscheduled = useMemo(
    () => tasks.filter((task) => !taskSpan(task)),
    [tasks]
  )

  return (
    <div className="flex flex-col">
      {days.map(({ date, entries }) => {
        const done = entries.filter((entry) =>
          completedStates.has(entry.task.stateId)
        ).length
        const today = isToday(date)

        // An empty day stays as a thin tick: the passage of time keeps reading
        // continuously without stretching the page.
        if (entries.length === 0) {
          return (
            <div
              key={date.toISOString()}
              className={cn(
                "flex items-center gap-3 py-1 pl-1 text-[11px] text-muted-foreground/60",
                today && "text-primary"
              )}
            >
              <span className="w-24 shrink-0">
                {formatDate(date, "weekdayShort", locale)}
              </span>
              <span className="h-px flex-1 bg-border/50" />
            </div>
          )
        }

        return (
          <section key={date.toISOString()} className="py-2">
            <header
              className={cn(
                // Sits below the page header, which reports its own height as
                // --public-header-height.
                "sticky top-(--public-header-height) z-10 mb-2 flex items-baseline gap-2 bg-background/95 py-1 backdrop-blur",
                today && "text-primary"
              )}
            >
              <h3 className="text-sm font-semibold">
                {formatDate(date, "weekdayLong", locale)}
              </h3>
              <span className="text-xs text-muted-foreground">
                {done} of {entries.length} done
              </span>
              {today && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  Today
                </span>
              )}
            </header>

            <TaskGrid
              items={entries.map((entry) => {
                const state = stateById.get(entry.task.stateId)
                const completed = completedStates.has(entry.task.stateId)
                if (!entry.first) {
                  return (
                    <button
                      key={entry.task.id}
                      type="button"
                      onClick={() => onSelect(entry.task)}
                      className="flex min-w-0 items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-left text-xs transition-colors hover:border-border hover:bg-muted/40"
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: state?.color }}
                      />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate",
                          completed && "text-muted-foreground"
                        )}
                      >
                        {entry.task.title}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        Day {entry.day} of {entry.total}
                      </span>
                    </button>
                  )
                }
                return (
                  <div
                    key={entry.task.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(entry.task)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        onSelect(entry.task)
                      }
                    }}
                    className="min-w-0 cursor-pointer rounded-xl border border-border/60 bg-card p-3 shadow-sm transition-all hover:border-border hover:shadow-md"
                  >
                    <TaskCardContent
                      title={entry.task.title}
                      description={entry.task.description}
                      priority={entry.task.priority}
                      labels={entry.task.labels}
                      startDate={entry.task.startDate}
                      dueDate={entry.task.dueDate}
                      documentCount={entry.task.documents.length}
                      completed={completed}
                      locale={locale}
                    />
                  </div>
                )
              })}
            />
          </section>
        )
      })}

      {unscheduled.length > 0 && (
        <section className="py-2">
          <header className="mb-2 flex items-baseline gap-2">
            <h3 className="text-sm font-semibold">Unscheduled</h3>
            <span className="text-xs text-muted-foreground">
              {unscheduled.length}
            </span>
          </header>
          <TaskGrid
            items={unscheduled.map((task) => (
              <div
                key={task.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(task)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    onSelect(task)
                  }
                }}
                className="min-w-0 cursor-pointer rounded-xl border border-border/60 bg-card p-3 shadow-sm transition-all hover:border-border hover:shadow-md"
              >
                <TaskCardContent
                  title={task.title}
                  description={task.description}
                  priority={task.priority}
                  labels={task.labels}
                  documentCount={task.documents.length}
                  completed={completedStates.has(task.stateId)}
                  locale={locale}
                />
              </div>
            ))}
          />
        </section>
      )}
    </div>
  )
}
