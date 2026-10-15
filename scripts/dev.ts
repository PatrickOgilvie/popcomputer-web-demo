import concurrently from 'concurrently'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'

import { nameApp } from './app-name'
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
    viteOrigin: readDevOrigin(`portless get ${VITE_ROUTE_NAME}`, resolveUrl(VITE_ROUTE_NAME)),
  }
}

/** Builds the inherited environment Vite reads for CORS and asset origins. */
export function createDevServerEnvironment(session: DevSession): DevServerEnvironment {
  return {
    DEV_VITE_ORIGIN: session.viteOrigin.origin,
    DEV_WORKER_ORIGIN: session.workerOrigin.origin,
  }
}

/**
 * Builds both server commands. Wrangler listens on the assigned loopback port
 * but sees requests at the public origin, so Better Auth and the framework's
 * origin checks see the address the browser uses.
 */
export function createDevCommands(
  session: DevSession
): ReadonlyArray<{ readonly name: string; readonly command: string }> {
  const vite =
    session.mode === 'portless'
      ? `portless run --name ${VITE_ROUTE_NAME} vite`
      : `vite --port ${DIRECT_VITE_PORT} --strictPort`
  const worker = [
    'wrangler dev',
    `--port ${session.workerPort}`,
    '--ip 127.0.0.1',
    `--local-upstream ${session.workerOrigin.host}`,
    `--upstream-protocol ${session.workerOrigin.protocol.slice(0, -1)}`,
    '--var ENVIRONMENT:development',
    `--var DEV_VITE_ORIGIN:${session.viteOrigin.origin}`,
  ].join(' ')

  return [
    { name: 'vite', command: vite },
    { name: 'worker', command: worker },
  ]
}

/** The oldest Node.js wrangler runs on. */
export const MINIMUM_NODE_MAJOR = 22

/**
 * Asks the `node` on PATH for its version. Without Node.js installed, `bun run`
 * puts its own stand-in first, which answers `bun`.
 */
function readNodeReport(): string | undefined {
  try {
    return execFileSync('node', ['-p', "typeof Bun === 'undefined' ? process.versions.node : 'bun'"], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return undefined
  }
}

/**
 * Why wrangler can't run here, if it can't. Under Bun's stand-in for Node.js,
 * its local server starts but never answers, so this stops before it does.
 */
export function nodeProblem(report: string | undefined): string | undefined {
  const advice = 'Install the LTS from https://nodejs.org, then run bun run dev again.'
  if (report === undefined || report === 'bun') {
    return `Wrangler needs Node.js ${MINIMUM_NODE_MAJOR} or later, and this computer has none. ${advice}`
  }
  const major = Number(report.split('.')[0])
  if (!(major >= MINIMUM_NODE_MAJOR)) {
    return `Wrangler needs Node.js ${MINIMUM_NODE_MAJOR} or later, and this computer has ${report}. ${advice}`
  }
  return undefined
}

/** The local secrets file `bun run dev` writes on first run, with a secret of its own. */
export function createDevVars(secret: string): string {
  return [
    '# Local secrets for `bun run dev`, written on its first run. Never commit this file.',
    `BETTER_AUTH_SECRET=${secret}`,
    '',
  ].join('\n')
}

/**
 * Writes `.dev.vars` with a fresh Better Auth secret when it is missing, so a
 * new app signs people in without editing anything. An existing file is kept.
 */
export function ensureDevVars(path = '.dev.vars'): boolean {
  if (existsSync(path)) return false
  writeFileSync(path, createDevVars(randomBytes(32).toString('base64')), { mode: 0o600 })
  return true
}

/**
 * Brings the local D1 database up to date. Without a terminal on its input,
 * wrangler applies the migrations without asking to confirm.
 */
function applyLocalMigrations(): void {
  const output = execFileSync('wrangler', ['d1', 'migrations', 'apply', 'DB', '--local'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  if (!output.includes('No migrations to apply')) console.log(output)
}

async function runDevelopmentServers(): Promise<number> {
  const problem = nodeProblem(readNodeReport())
  if (problem !== undefined) {
    console.error(problem)
    return 1
  }

  nameApp()
  if (ensureDevVars()) console.log('Wrote .dev.vars with a new secret for signing in locally.')
  try {
    applyLocalMigrations()
  } catch {
    console.error('Could not apply the local database migrations; wrangler said why above.')
    return 1
  }

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

  console.log(`App: ${session.workerOrigin.origin} · Vite: ${session.viteOrigin.origin}`)

  const { result } = concurrently([...createDevCommands(session)], {
    killOthersOn: ['failure', 'success'],
    prefix: 'name',
    prefixColors: ['magenta', 'cyan'],
  })

  try {
    await result
    return 0
  } catch {
    return 1
  }
}

if (import.meta.main) {
  process.exitCode = await runDevelopmentServers()
}
