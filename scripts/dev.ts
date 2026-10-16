import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

/** The port Vite listens on when portless is bypassed with `PORTLESS=0`. */
export const DIRECT_PORT = 5173

/**
 * Where Vite listens and the address a browser opens. Cloudflare's Vite plugin
 * runs the Worker inside Vite's dev server, so the pages and their scripts
 * share the one address.
 */
export interface DevSession {
  readonly mode: 'portless' | 'direct'
  readonly port: number
  readonly appOrigin: string
}

/** Values portless injects into the process it runs. */
export interface PortlessProcessEnvironment {
  readonly PORT?: string
  readonly PORTLESS_URL?: string
}

/** Portless assigned the app an unusable port. */
export class InvalidPortlessPort extends Error {
  readonly _tag = 'InvalidPortlessPort' as const

  constructor() {
    super('portless must provide PORT as an integer between 1 and 65535.')
  }
}

/** Portless gave the app an address that isn't http(s). */
export class InvalidPortlessUrl extends Error {
  readonly _tag = 'InvalidPortlessUrl' as const

  constructor() {
    super('portless must provide PORTLESS_URL as an http or https address.')
  }
}

function readPortlessPort(value: string | undefined): number {
  const port = Number(value)
  if (value === undefined || !/^[1-9]\d*$/.test(value) || port > 65_535) {
    throw new InvalidPortlessPort()
  }

  return port
}

/**
 * Reads the port and address portless assigned to this process. Without
 * portless (`PORTLESS=0`), Vite listens on one fixed port and fails fast if
 * it is already taken.
 */
export function readDevSession(environment: PortlessProcessEnvironment): DevSession {
  if (environment.PORTLESS_URL === undefined) {
    return { mode: 'direct', port: DIRECT_PORT, appOrigin: `http://localhost:${DIRECT_PORT}` }
  }

  let url: URL
  try {
    url = new URL(environment.PORTLESS_URL)
  } catch {
    throw new InvalidPortlessUrl()
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new InvalidPortlessUrl()

  return { mode: 'portless', port: readPortlessPort(environment.PORT), appOrigin: url.origin }
}

/** Vite's arguments: the assigned port on loopback under portless, or the fixed one. */
export function createViteArguments(session: DevSession): ReadonlyArray<string> {
  return session.mode === 'portless'
    ? ['--port', String(session.port), '--strictPort', '--host', '127.0.0.1']
    : ['--port', String(session.port), '--strictPort']
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
 * wrangler applies the migrations without asking to confirm. It reads
 * wrangler.jsonc itself, not the copy a build writes into dist/.
 */
function applyLocalMigrations(): void {
  const output = execFileSync('wrangler', ['d1', 'migrations', 'apply', 'DB', '--local', '-c', 'wrangler.jsonc'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const applied = countAppliedMigrations(output)
  if (applied > 0) console.log(`Applied ${applied} migration${applied === 1 ? '' : 's'} to the local database.`)
}

/** Lines of the list of Local Explorer routes shown when an AI agent runs the server. */
const EXPLORER_NOTICE_LINES = 20

/**
 * Rewrites Vite's output for a person, so it names one address to open: it
 * drops Node's punycode deprecation notice and Vite's loopback addresses,
 * shortens the list of routes for AI agents to the Local Explorer's address,
 * and once Vite is ready says where to open the app. The agents' list is
 * skipped for at most a few lines, so a change to its wording never hides
 * anything after it.
 */
export function createOutputFilter(appOrigin: string): (line: string) => ReadonlyArray<string> {
  let explorerNoticeLeft = 0
  let skipDeprecationHint = false
  return (line) => {
    const plain = line.replace(/\x1b\[[0-9;]*m/g, '')
    if (plain.includes('detected this dev session is running in an AI agent')) {
      explorerNoticeLeft = EXPLORER_NOTICE_LINES
      return []
    }
    if (explorerNoticeLeft > 0) {
      explorerNoticeLeft = plain.trimEnd().endsWith('- OpenAPI schema') ? 0 : explorerNoticeLeft - 1
      const explorer = /The Local Explorer API is available at (\S+)/.exec(plain)
      return explorer === null ? [] : [`Local Explorer, for the local database, KV and traces: ${explorer[1]}`]
    }
    if (plain.includes('[DEP0040]')) {
      skipDeprecationHint = true
      return []
    }
    if (skipDeprecationHint && plain.startsWith('(Use `node --trace-deprecation')) {
      skipDeprecationHint = false
      return []
    }
    skipDeprecationHint = false
    if (/^\s*➜\s+(Local|Network|Debug):/.test(plain)) return []
    if (/VITE v\S+\s+ready in/.test(plain)) return [line, `  Open ${appOrigin} in your browser.`]
    return [line]
  }
}

/** Passes each line a stream writes through the filter to `write`. */
function pipeLines(
  stream: NodeJS.ReadableStream,
  filter: (line: string) => ReadonlyArray<string>,
  write: (text: string) => void
): void {
  createInterface({ input: stream, crlfDelay: Infinity }).on('line', (line) => {
    for (const shown of filter(line)) write(`${shown}\n`)
  })
}

async function runDevelopmentServer(): Promise<number> {
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
    session = readDevSession({ PORT: process.env.PORT, PORTLESS_URL: process.env.PORTLESS_URL })
  } catch (cause: unknown) {
    if (cause instanceof InvalidPortlessPort || cause instanceof InvalidPortlessUrl) {
      console.error(cause.message)
      return 1
    }
    throw cause
  }

  // portless passes Ctrl-C on as SIGINT to Vite too; wait for it to stop.
  process.on('SIGINT', () => {})

  const vite = spawn('vite', [...createViteArguments(session)], {
    stdio: ['inherit', 'pipe', 'pipe'],
    // Vite colours its output only for a terminal; the filter sits between them.
    env: process.stdout.isTTY ? { ...process.env, FORCE_COLOR: '1' } : process.env,
  })
  const filter = createOutputFilter(session.appOrigin)
  pipeLines(vite.stdout, filter, (text) => process.stdout.write(text))
  pipeLines(vite.stderr, filter, (text) => process.stderr.write(text))

  return new Promise((resolve) => vite.on('exit', (code) => resolve(code ?? 0)))
}

if (import.meta.main) {
  process.exitCode = await runDevelopmentServer()
}
