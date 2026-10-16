import concurrently from 'concurrently'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { Writable } from 'node:stream'

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
  /** The portless route Vite runs under, beside the Worker's. */
  readonly viteRouteName: string
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
  resolveUrl: PortlessUrlResolver = resolvePortlessUrl,
  viteRouteName: string = VITE_ROUTE_NAME
): DevSession {
  if (environment.PORTLESS_URL === undefined) {
    return {
      mode: 'direct',
      viteRouteName,
      workerPort: DIRECT_WORKER_PORT,
      workerOrigin: new URL(`http://localhost:${DIRECT_WORKER_PORT}`),
      viteOrigin: new URL(`http://localhost:${DIRECT_VITE_PORT}`),
    }
  }

  return {
    mode: 'portless',
    viteRouteName,
    workerPort: readPortlessPort(environment.PORT),
    workerOrigin: readDevOrigin('PORTLESS_URL', environment.PORTLESS_URL),
    viteOrigin: readDevOrigin(`portless get ${viteRouteName}`, resolveUrl(viteRouteName)),
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
      ? `portless run --name ${session.viteRouteName} vite`
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

/** The placeholder `.dev.vars.example` ships with, which secures nothing. */
const PLACEHOLDER_SECRET = /^BETTER_AUTH_SECRET=replace-me.*$/m

/**
 * Writes `.dev.vars` with a fresh Better Auth secret when it is missing, so a
 * new app signs people in without editing anything, and replaces the example's
 * placeholder if someone copied it. Any other file is kept.
 */
export function ensureDevVars(path = '.dev.vars'): 'written' | 'replaced' | 'kept' {
  const secret = () => randomBytes(32).toString('base64')
  if (!existsSync(path)) {
    writeFileSync(path, createDevVars(secret()), { mode: 0o600 })
    return 'written'
  }
  const vars = readFileSync(path, 'utf8')
  if (!PLACEHOLDER_SECRET.test(vars)) return 'kept'
  writeFileSync(path, vars.replace(PLACEHOLDER_SECRET, `BETTER_AUTH_SECRET=${secret()}`))
  return 'replaced'
}

/**
 * How many migrations wrangler's output says it applied: one ✅ in its status
 * table for each. Its "✅ No migrations to apply!" has no table, so counts none.
 */
export function countAppliedMigrations(output: string): number {
  return output.match(/│\s*✅\s*│/g)?.length ?? 0
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
  const applied = countAppliedMigrations(output)
  if (applied > 0) console.log(`Applied ${applied} migration${applied === 1 ? '' : 's'} to the local database.`)
}

/** Lines of wrangler's notice that local crons don't run, which a person needn't act on. */
const CRON_NOTICE_LINES = 6

/** Lines of wrangler's list of Local Explorer routes, shown when an AI agent runs it. */
const EXPLORER_NOTICE_LINES = 20

/**
 * Rewrites the two servers' output for a person, so it names one address to
 * open: it drops Vite's portless banner and loopback address, empty lines and
 * wrangler's notice that crons don't run locally, shortens its list of routes
 * for AI agents to the one address, says where to open the app in place of
 * the Worker's loopback address, and after Ctrl-C drops the servers' exit
 * codes, which read like failures. A notice is skipped for at most a few
 * lines, so a change to its wording never hides anything after it.
 */
export function createOutputFilter(
  appOrigin: string,
  stopping: () => boolean
): (line: string) => ReadonlyArray<string> {
  let cronNoticeLeft = 0
  let explorerNoticeLeft = 0
  return (line) => {
    // An agent's run lists every Local Explorer route; one line keeps where it is.
    if (line.includes('Wrangler detected this dev session is running in an AI agent')) {
      explorerNoticeLeft = EXPLORER_NOTICE_LINES
      return []
    }
    if (explorerNoticeLeft > 0) {
      explorerNoticeLeft = line.trimEnd().endsWith('- OpenAPI schema') ? 0 : explorerNoticeLeft - 1
      const explorer = /The Local Explorer API is available at (\S+)/.exec(line)
      return explorer === null ? [] : [`[worker] Local Explorer, for the local database, KV and traces: ${explorer[1]}`]
    }
    if (line.includes('Scheduled Workers are not automatically triggered')) {
      cronNoticeLeft = CRON_NOTICE_LINES
      return []
    }
    if (cronNoticeLeft > 0) {
      cronNoticeLeft = line.includes('test-cron-triggers-locally') ? 0 : cronNoticeLeft - 1
      return []
    }
    if (stopping() && (line.includes('exited with code') || line.includes('Sending SIGTERM to other processes'))) {
      return []
    }
    const plain = line.replace(/\x1b\[[0-9;]*m/g, '')
    if (/^\[(vite|worker)\]\s*$/.test(plain)) return []
    if (/^\[vite\]\s*(portless$|-- |-> |Running: PORT=|➜\s+(Local|Network):)/.test(plain)) return []
    if (plain.includes('Ready on http')) return [`Open ${appOrigin} in your browser.`]
    return [line]
  }
}

/** A stream that passes each whole line of output through the filter to stdout. */
function filteredOutput(filter: (line: string) => ReadonlyArray<string>): Writable {
  let partial = ''
  const writeLines = (lines: ReadonlyArray<string>) => {
    for (const line of lines) for (const shown of filter(line)) process.stdout.write(`${shown}\n`)
  }
  return new Writable({
    write(chunk: Buffer | string, _encoding, done) {
      const lines = (partial + chunk.toString()).split('\n')
      partial = lines.pop() ?? ''
      writeLines(lines)
      done()
    },
    final(done) {
      if (partial !== '') writeLines([partial])
      done()
    },
  })
}

async function runDevelopmentServers(): Promise<number> {
  const problem = nodeProblem(readNodeReport())
  if (problem !== undefined) {
    console.error(problem)
    return 1
  }

  const devVars = ensureDevVars()
  if (devVars === 'written') console.log('Wrote .dev.vars with a new secret for signing in locally.')
  if (devVars === 'replaced') console.log("Replaced .dev.vars's placeholder secret with a new one.")
  try {
    applyLocalMigrations()
  } catch (cause: unknown) {
    if (typeof cause === 'object' && cause !== null && 'stdout' in cause) console.error(String(cause.stdout))
    console.error('Could not apply the local database migrations; wrangler says why above.')
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

  // portless passes Ctrl-C on as SIGINT; the servers stopping after it is no failure.
  let stopping = false
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      stopping = true
    })
  }

  const { result } = concurrently([...createDevCommands(session)], {
    killOthersOn: ['failure', 'success'],
    prefix: 'name',
    prefixColors: ['magenta', 'cyan'],
    outputStream: filteredOutput(createOutputFilter(session.workerOrigin.origin, () => stopping)),
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
