import concurrently from 'concurrently'
import { execFileSync } from 'node:child_process'

import {
  DIRECT_VITE_PORT,
  DIRECT_WORKER_PORT,
  type DevServerEnvironment,
  InvalidDevOrigin,
  readDevOrigin,
  VITE_ROUTE_NAME,
} from './dev-environment'

/** How the paired development servers listen and how browsers reach them. */
export interface DevSession {
  readonly mode: 'portless' | 'direct'
  readonly workerPort: number
  readonly workerOrigin: URL
  readonly viteOrigin: URL
}

/** Values portless injects into the process it runs for the Worker route. */
export interface PortlessProcessEnvironment {
  readonly PORT?: string
  readonly PORTLESS_URL?: string
}

type PortlessUrlResolver = (routeName: string) => string

/** Portless assigned the Worker route an unusable port. */
export class InvalidPortlessPort extends Error {
  readonly _tag = 'InvalidPortlessPort' as const

  constructor() {
    super('portless must provide PORT as an integer between 1 and 65535.')
  }
}

function readPortlessPort(value: string | undefined): number {
  const port = Number(value)
  if (value === undefined || !/^[1-9]\d*$/.test(value) || port > 65_535) {
    throw new InvalidPortlessPort()
  }

  return port
}

/** Resolves a sibling route with the same worktree prefix and proxy state. */
const resolvePortlessUrl: PortlessUrlResolver = (routeName) =>
  execFileSync('portless', ['get', routeName], { encoding: 'utf8' }).trim()

/**
 * Reads the Worker route portless assigned to this process and resolves the
 * matching Vite route. Without portless (`PORTLESS=0`), both servers use one
 * fixed loopback pair and fail fast if either port is already taken.
 */
export function readDevSession(
  environment: PortlessProcessEnvironment,
  resolveUrl: PortlessUrlResolver = resolvePortlessUrl
): DevSession {
  if (environment.PORTLESS_URL === undefined) {
    return {
      mode: 'direct',
      workerPort: DIRECT_WORKER_PORT,
      workerOrigin: new URL(`http://localhost:${DIRECT_WORKER_PORT}`),
      viteOrigin: new URL(`http://localhost:${DIRECT_VITE_PORT}`),
    }
  }

  return {
    mode: 'portless',
    workerPort: readPortlessPort(environment.PORT),
    workerOrigin: readDevOrigin('PORTLESS_URL', environment.PORTLESS_URL),
    viteOrigin: readDevOrigin(
      `portless get ${VITE_ROUTE_NAME}`,
      resolveUrl(VITE_ROUTE_NAME)
    ),
  }
}

/** Builds the inherited environment Vite reads for CORS and asset origins. */
export function createDevServerEnvironment(
  session: DevSession
): DevServerEnvironment {
  return {
    DEV_VITE_ORIGIN: session.viteOrigin.origin,
    DEV_WORKER_ORIGIN: session.workerOrigin.origin,
  }
}

/**
 * Builds both server commands. Wrangler listens on the assigned loopback port
 * but sees requests at the public origin, so same-origin checks and Better
 * Auth agree with the browser even when portless terminates HTTPS.
 */
export function createDevCommands(
  session: DevSession
): ReadonlyArray<{ readonly name: string; readonly command: string }> {
  const vite =
    session.mode === 'portless'
      ? `portless run --name ${VITE_ROUTE_NAME} vite`
      : `vite --port ${DIRECT_VITE_PORT} --strictPort`
  const worker = [
    'bun run dev:worker --',
    `--port ${session.workerPort}`,
    '--ip 127.0.0.1',
    `--local-upstream ${session.workerOrigin.host}`,
    `--upstream-protocol ${session.workerOrigin.protocol.slice(0, -1)}`,
    '--var ENVIRONMENT:development',
    `--var APP_ORIGIN:${session.workerOrigin.origin}`,
    `--var DEV_VITE_ORIGIN:${session.viteOrigin.origin}`,
  ].join(' ')

  return [
    { name: 'vite', command: vite },
    { name: 'worker', command: worker },
  ]
}

async function runDevelopmentServers(): Promise<number> {
  let session: DevSession
  try {
    session = readDevSession({
      PORT: process.env.PORT,
      PORTLESS_URL: process.env.PORTLESS_URL,
    })
  } catch (cause: unknown) {
    if (cause instanceof InvalidDevOrigin || cause instanceof InvalidPortlessPort) {
      console.error(cause.message)
      return 1
    }
    throw cause
  }

  Object.assign(process.env, createDevServerEnvironment(session))

  console.log(
    `App: ${session.workerOrigin.origin} · Vite: ${session.viteOrigin.origin}`
  )

  const { result } = concurrently([...createDevCommands(session)], {
    killOthersOn: ['failure', 'success'],
    prefix: 'name',
    prefixColors: ['magenta', 'cyan'],
  })

  try {
    await result
    return 0
  } catch (_cause: unknown) {
    return 1
  }
}

if (import.meta.main) {
  process.exitCode = await runDevelopmentServers()
}
