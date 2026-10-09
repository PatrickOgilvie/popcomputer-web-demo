/** Portless route for the Worker; linked git worktrees get a branch prefix. */
export const WORKER_ROUTE_NAME = 'popcomputer-web-demo'

/** Portless route for the Vite asset and HMR server. */
export const VITE_ROUTE_NAME = `vite.${WORKER_ROUTE_NAME}`

/** Fixed loopback pair used only when portless is bypassed with `PORTLESS=0`. */
export const DIRECT_WORKER_PORT = 8787
export const DIRECT_VITE_PORT = 5173

/** Environment shared by the paired Worker and Vite development processes. */
export interface DevServerEnvironment {
  readonly DEV_VITE_ORIGIN: string
  readonly DEV_WORKER_ORIGIN: string
}

/** Validated Vite settings derived from the paired development environment. */
export interface ViteDevServerConfiguration {
  readonly viteOrigin: string
  readonly workerOrigin: string
}

/** A development origin was not an exact local HTTP(S) origin. */
export class InvalidDevOrigin extends Error {
  readonly _tag = 'InvalidDevOrigin' as const

  constructor(readonly variable: string) {
    super(`${variable} must be an exact local HTTP(S) origin.`)
  }
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost')
  )
}

/**
 * Parses one exact origin for a local development server. Portless publishes
 * `*.localhost` names; the direct fallback uses plain loopback hosts.
 */
export function readDevOrigin(variable: string, value: string | undefined): URL {
  if (value === undefined) throw new InvalidDevOrigin(variable)

  let origin: URL
  try {
    origin = new URL(value)
  } catch {
    throw new InvalidDevOrigin(variable)
  }

  if (
    (origin.protocol !== 'http:' && origin.protocol !== 'https:') ||
    !isLocalHostname(origin.hostname) ||
    origin.username !== '' ||
    origin.password !== '' ||
    origin.pathname !== '/' ||
    origin.search !== '' ||
    origin.hash !== '' ||
    origin.origin !== value
  ) {
    throw new InvalidDevOrigin(variable)
  }

  return origin
}

/**
 * Parses the two values Vite consumes from `bun run dev`. Standalone Vite
 * commands such as `vite build` receive neither and need no dev-server policy.
 */
export function readViteDevServerConfiguration(environment?: {
  readonly DEV_VITE_ORIGIN?: string
  readonly DEV_WORKER_ORIGIN?: string
}): ViteDevServerConfiguration | undefined {
  const values = environment ?? {
    DEV_VITE_ORIGIN: process.env.DEV_VITE_ORIGIN,
    DEV_WORKER_ORIGIN: process.env.DEV_WORKER_ORIGIN,
  }
  if (values.DEV_VITE_ORIGIN === undefined && values.DEV_WORKER_ORIGIN === undefined) {
    return undefined
  }

  return {
    viteOrigin: readDevOrigin('DEV_VITE_ORIGIN', values.DEV_VITE_ORIGIN).origin,
    workerOrigin: readDevOrigin('DEV_WORKER_ORIGIN', values.DEV_WORKER_ORIGIN)
      .origin,
  }
}
