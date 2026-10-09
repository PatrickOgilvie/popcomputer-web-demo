import { describe, expect, test } from 'bun:test'

import { formatDate, formatDateTime, formatRelativeTime } from '~/components/format'

const now = Date.parse('2026-10-09T12:00:00.000Z')

describe('timestamp formatting', () => {
  test.each([
    ['2026-10-09T11:59:30.000Z', 'just now'],
    ['2026-10-09T12:00:05.000Z', 'just now'],
    ['2026-10-09T11:55:00.000Z', '5 minutes ago'],
    ['2026-10-09T09:00:00.000Z', '3 hours ago'],
    ['2026-10-08T11:00:00.000Z', 'yesterday'],
    ['2026-10-05T12:00:00.000Z', '4 days ago'],
  ])('describes %s relative to now as %p', (value, expected) => {
    expect(formatRelativeTime(value, now, 'en-US')).toBe(expected)
  })

  test('falls back to a date after a week', () => {
    expect(formatRelativeTime('2026-09-01T12:00:00.000Z', now, 'en-US')).toBe(
      formatDate('2026-09-01T12:00:00.000Z', 'en-US')
    )
  })

  test('returns unparseable values unchanged', () => {
    expect(formatRelativeTime('not a date', now)).toBe('not a date')
    expect(formatDateTime('not a date')).toBe('not a date')
  })
})
