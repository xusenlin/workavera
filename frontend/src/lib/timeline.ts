import {
  differenceInCalendarDays,
  differenceInCalendarWeeks,
  eachDayOfInterval,
  eachWeekOfInterval,
  parseISO,
  startOfWeek,
} from "date-fns"

/** A task as the timeline sees it: a title is irrelevant, dates are not. */
export type TimelineDates = {
  startDate?: string
  dueDate?: string
}

export type TimelineSpan = {
  start: Date
  end: Date
}

export type TimelineScale = {
  unit: "day" | "week"
  columnWidth: number
  /** The first day of every column, in order. */
  columns: Date[]
}

export type TimelinePlacement = {
  /** 1-based, ready for grid-column. */
  column: number
  span: number
}

/**
 * The span a task occupies. A task with both dates spans them; a task with one
 * sits on that day alone; a task with neither is unscheduled and has no span.
 */
export function taskSpan(task: TimelineDates): TimelineSpan | null {
  const start = task.startDate ? parseISO(task.startDate) : null
  const due = task.dueDate ? parseISO(task.dueDate) : null
  if (start && due) {
    // A stored inversion would render as a negative span, so it reads as the
    // single day it is anchored to instead.
    return start <= due ? { start, end: due } : { start: due, end: due }
  }
  const day = start ?? due
  return day ? { start: day, end: day } : null
}

/** The interval covering every scheduled task, or null when none is. */
export function timelineRange(tasks: TimelineDates[]): TimelineSpan | null {
  let range: TimelineSpan | null = null
  for (const task of tasks) {
    const span = taskSpan(task)
    if (!span) continue
    if (!range) {
      range = { ...span }
      continue
    }
    if (span.start < range.start) range.start = span.start
    if (span.end > range.end) range.end = span.end
  }
  return range
}

/**
 * Column width follows the length of the project: a short project gets days
 * wide enough to label, a long one narrows them, and past roughly half a year
 * a day column stops being worth its pixels and the axis switches to weeks.
 */
export function timelineScale(range: TimelineSpan): TimelineScale {
  const days = differenceInCalendarDays(range.end, range.start) + 1
  if (days > 180) {
    return {
      unit: "week",
      columnWidth: 28,
      columns: eachWeekOfInterval(
        { start: range.start, end: range.end },
        { weekStartsOn: 1 }
      ),
    }
  }
  return {
    unit: "day",
    columnWidth: days > 60 ? 24 : 48,
    columns: eachDayOfInterval({ start: range.start, end: range.end }),
  }
}

/**
 * Below this a bar shows a couple of clipped characters rather than a title,
 * which reads worse than no title at all — those bars rely on their tooltip.
 */
const MIN_LABEL_BAR_WIDTH = 72

/** Whether a bar is wide enough for its title to be worth rendering. */
export function barFitsLabel(
  placement: TimelinePlacement,
  scale: TimelineScale
) {
  return placement.span * scale.columnWidth >= MIN_LABEL_BAR_WIDTH
}

/** The 0-based column a date falls in, clamped to the timeline. */
export function columnIndex(
  date: Date,
  range: TimelineSpan,
  scale: TimelineScale
) {
  const index =
    scale.unit === "week"
      ? differenceInCalendarWeeks(date, startOfWeek(range.start, { weekStartsOn: 1 }), {
          weekStartsOn: 1,
        })
      : differenceInCalendarDays(date, range.start)
  return Math.min(Math.max(index, 0), scale.columns.length - 1)
}

/** Places a span on the grid as a 1-based column start and a column count. */
export function placeSpan(
  span: TimelineSpan,
  range: TimelineSpan,
  scale: TimelineScale
): TimelinePlacement {
  const start = columnIndex(span.start, range, scale)
  const end = columnIndex(span.end, range, scale)
  return { column: start + 1, span: Math.max(end - start + 1, 1) }
}

/**
 * Packs items into as few rows as possible by reusing a row for the next item
 * that starts after everything already on it ends. Row count then reflects how
 * much runs in parallel rather than how many tasks exist, which is what keeps
 * a busy project readable in one screen.
 */
export function packLanes<T>(
  items: T[],
  getSpan: (item: T) => TimelineSpan | null
): T[][] {
  const scheduled = items
    .map((item) => ({ item, span: getSpan(item) }))
    .filter((entry): entry is { item: T; span: TimelineSpan } =>
      Boolean(entry.span)
    )
    .sort((a, b) => a.span.start.getTime() - b.span.start.getTime())

  const lanes: T[][] = []
  const laneEnds: Date[] = []
  for (const { item, span } of scheduled) {
    const index = laneEnds.findIndex((end) => end < span.start)
    if (index === -1) {
      lanes.push([item])
      laneEnds.push(span.end)
      continue
    }
    lanes[index].push(item)
    laneEnds[index] = span.end
  }
  return lanes
}

/** Every day of the timeline, for the day-by-day layer. */
export function timelineDays(range: TimelineSpan) {
  return eachDayOfInterval({ start: range.start, end: range.end })
}

/** Whether a day falls inside a span, comparing calendar days only. */
export function spanCoversDay(span: TimelineSpan, day: Date) {
  return (
    differenceInCalendarDays(day, span.start) >= 0 &&
    differenceInCalendarDays(span.end, day) >= 0
  )
}

/** `Day 2 of 5` for a task the visitor meets mid-span. */
export function dayOfSpan(span: TimelineSpan, day: Date) {
  return {
    day: differenceInCalendarDays(day, span.start) + 1,
    total: differenceInCalendarDays(span.end, span.start) + 1,
  }
}
