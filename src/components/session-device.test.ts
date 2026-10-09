import { describe, expect, test } from 'bun:test'

import { describeSessionDevice } from '~/components/session-device'

describe('session device labels', () => {
  test.each([
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'Chrome on macOS',
      'desktop',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
      'Safari on macOS',
      'desktop',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      'Safari on iPhone',
      'mobile',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
      'Edge on Windows',
      'desktop',
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
      'Firefox on Linux',
      'desktop',
    ],
    [
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
      'Chrome on Android',
      'mobile',
    ],
  ] as const)('describes %s', (userAgent, label, kind) => {
    expect(describeSessionDevice(userAgent)).toEqual({ label, kind })
  })

  test('falls back for missing or unrecognized agents', () => {
    expect(describeSessionDevice(null)).toEqual({ label: 'Unknown device', kind: 'unknown' })
    expect(describeSessionDevice('curl/8.7.1')).toEqual({ label: 'Web browser', kind: 'unknown' })
  })
})
