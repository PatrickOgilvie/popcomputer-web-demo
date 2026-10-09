const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function parse(value: string): Date | undefined {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/** Formats an ISO timestamp as a short date and time in the viewer's locale. */
export function formatDateTime(value: string, locale?: string): string {
  const date = parse(value)
  return date === undefined
    ? value
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

/** Formats an ISO timestamp as a date in the viewer's locale. */
export function formatDate(value: string, locale?: string): string {
  const date = parse(value)
  return date === undefined
    ? value
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
}

/**
 * Describes how long ago a timestamp was, falling back to a date after a week.
 * Future timestamps (clock skew) read as "just now".
 */
export function formatRelativeTime(
  value: string,
  now: number = Date.now(),
  locale?: string
): string {
  const date = parse(value)
  if (date === undefined) return value

  const elapsed = now - date.getTime()
  if (elapsed < MINUTE) return 'just now'

  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), 'minute')
  if (elapsed < DAY) return relative.format(-Math.floor(elapsed / HOUR), 'hour')
  if (elapsed < 7 * DAY) return relative.format(-Math.floor(elapsed / DAY), 'day')
  return formatDate(value, locale)
}
