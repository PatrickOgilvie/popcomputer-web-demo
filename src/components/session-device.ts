/** A readable description of the browser and device behind a session. */
export interface SessionDevice {
  readonly label: string
  readonly kind: 'desktop' | 'mobile' | 'unknown'
}

const browsers: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg(?:e|A|iOS)?\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/CriOS\/|Chrome\/|HeadlessChrome\//, 'Chrome'],
  [/Version\/[\d.]+.*Safari\//, 'Safari'],
]

const systems: ReadonlyArray<readonly [RegExp, string, SessionDevice['kind']]> = [
  [/iPhone|iPod/, 'iPhone', 'mobile'],
  [/iPad/, 'iPad', 'mobile'],
  [/Android/, 'Android', 'mobile'],
  [/CrOS/, 'ChromeOS', 'desktop'],
  [/Macintosh|Mac OS X/, 'macOS', 'desktop'],
  [/Windows/, 'Windows', 'desktop'],
  [/Linux/, 'Linux', 'desktop'],
]

/** Derives a short device label such as "Chrome on macOS" from a user agent. */
export function describeSessionDevice(userAgent: string | null): SessionDevice {
  if (!userAgent) return { label: 'Unknown device', kind: 'unknown' }

  const browser = browsers.find(([pattern]) => pattern.test(userAgent))?.[1]
  const system = systems.find(([pattern]) => pattern.test(userAgent))

  if (browser && system) {
    return { label: `${browser} on ${system[1]}`, kind: system[2] }
  }
  if (system) return { label: system[1], kind: system[2] }
  if (browser) return { label: browser, kind: 'unknown' }
  return { label: 'Web browser', kind: 'unknown' }
}
