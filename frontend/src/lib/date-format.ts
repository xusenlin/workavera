import { format, parseISO } from "date-fns"
import { zhCN } from "date-fns/locale"

/**
 * The public preview reads in English by default and switches to Chinese date
 * formatting with `?lang=zh`. Only dates follow the parameter: the rest of the
 * page keeps the interface language it is written in.
 */
export type DateLocale = "en" | "zh"

/** Any `zh` variant selects Chinese; everything else stays on the default. */
export function resolveDateLocale(value: string | null): DateLocale {
  return value?.toLowerCase().startsWith("zh") ? "zh" : "en"
}

/**
 * Chinese dates are not the English patterns with translated words: they order
 * the parts differently and carry their own separators, so each locale names
 * its own pattern instead of sharing one.
 */
const PATTERNS = {
  en: {
    /** `Aug 3` */
    monthDay: "MMM d",
    /** `Aug 3, 2026` */
    monthDayYear: "MMM d, yyyy",
    /** `Aug 2026` */
    monthYear: "MMM yyyy",
    /** `Mon, Aug 3` */
    weekdayShort: "EEE, MMM d",
    /** `Monday, Aug 3` */
    weekdayLong: "EEEE, MMM d",
    /** `M` */
    weekdayNarrow: "EEEEE",
    /** `3` */
    dayOfMonth: "d",
  },
  zh: {
    monthDay: "M月d日",
    monthDayYear: "yyyy年M月d日",
    monthYear: "yyyy年M月",
    weekdayShort: "M月d日 EEE",
    weekdayLong: "M月d日 EEEE",
    weekdayNarrow: "EEEEE",
    dayOfMonth: "d",
  },
} as const

export type DatePattern = keyof (typeof PATTERNS)["en"]

export function formatDate(
  date: Date,
  pattern: DatePattern,
  locale: DateLocale
) {
  return format(date, PATTERNS[locale][pattern], {
    locale: locale === "zh" ? zhCN : undefined,
  })
}

/** The `date-fns` locale for helpers that format on their own, e.g. distances. */
export function dateFnsLocale(locale: DateLocale) {
  return locale === "zh" ? zhCN : undefined
}

/** A start and a due date read as one span; either alone reads as a day. */
export function formatTaskSpan(
  startDate?: string,
  dueDate?: string,
  locale: DateLocale = "en"
) {
  const day = (value: string) => formatDate(parseISO(value), "monthDay", locale)
  if (startDate && dueDate && startDate !== dueDate) {
    return `${day(startDate)} – ${day(dueDate)}`
  }
  const single = dueDate ?? startDate
  return single ? day(single) : ""
}

export function isOverdue(dueDate?: string) {
  if (!dueDate) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(dueDate) < today
}
