export type ZonedDateTimeParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export function zonedParts(
  value: Date | string,
  timeZone: string
): ZonedDateTimeParts {
  const date = typeof value === "string" ? new Date(value) : value
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0)
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  }
}

export function zonedDateTimeToDate(
  date: string,
  time: string,
  timeZone: string
) {
  const [year, month, day] = date.split("-").map(Number)
  const [hour, minute, second = 0] = time.split(":").map(Number)
  const wallTime = Date.UTC(year, month - 1, day, hour, minute, second)

  const offsetAt = (instant: number) => {
    const parts = zonedParts(new Date(instant), timeZone)
    return (
      Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second
      ) - instant
    )
  }

  let instant = wallTime - offsetAt(wallTime)
  instant = wallTime - offsetAt(instant)
  return new Date(instant)
}

export function formatZonedDate(value: Date | string, timeZone: string) {
  const parts = zonedParts(value, timeZone)
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

export function formatZonedTime(value: Date | string, timeZone: string) {
  const parts = zonedParts(value, timeZone)
  return `${pad(parts.hour)}:${pad(parts.minute)}`
}

export function addDaysToDate(date: string, amount: number) {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day + amount))
    .toISOString()
    .slice(0, 10)
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}
