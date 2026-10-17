import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { parseEnv, stripVTControlCharacters } from 'node:util'

import type { EnvDeclaration } from '@popcomputer/web/env'

import { env } from '../src/env'
import { checkLocal, generatorOf, isPlaceholder, readDevVars, readWranglerVars } from './env'

/** Where `bun run dev` keeps its process id, for `bun run stop` to find it. */
export const DEV_PID_FILE = '.wrangler/dev.pid'

/**
 * The `bun run dev` whose process id DEV_PID_FILE holds, if it is still
 * running. A process that took the id over after it ended runs something else.
 */
export function readRunningDev(path = DEV_PID_FILE): number | undefined {
  let pid: number
  try {
    pid = Number(readFileSync(path, 'utf8').trim())
  } catch {
    return undefined
  }
  if (!Number.isInteger(pid) || pid <= 0) return undefined
  try {
    const command = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return command.includes('scripts/run-dev.ts') ? pid : undefined
  } catch {
    return undefined
  }
}

/** A process and every process it started, parents before their children. */
export function processTree(pid: number): ReadonlyArray<number> {
  let children: ReadonlyArray<number>
  try {
    children = execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map(Number)
  } catch {
    // pgrep exits 1 when the process has no children.
    children = []
  }
  return [pid, ...children.flatMap(processTree)]
}

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

/** The first line of the `.dev.vars` `bun run dev` writes. */
const DEV_VARS_HEADER = '# Local secrets for `bun run dev`, which wrote this file. Never commit it.'

/** A `.dev.vars` line, the value quoted when it holds anything but letters, digits and base64's symbols. */
function devVarsLine(name: string, value: string): string {
  return /^[\w+/=.:@-]*$/.test(value) ? `${name}=${value}` : `${name}=${JSON.stringify(value)}`
}

/** What `ensureDevVars` did, and which secrets it wrote. */
export interface DevVarsUpdate {
  readonly file: 'written' | 'updated' | 'kept'
  readonly names: ReadonlyArray<string>
}

/**
 * Gives `.dev.vars` a new value for each secret src/env.ts can generate and
 * the file lacks, or holds as the example's placeholder, so a new app signs
 * people in without editing anything. The first run writes the whole file,
 * readable only by its owner; every value already there is kept.
 */
export function ensureDevVars(declaration: EnvDeclaration = env, path = '.dev.vars'): DevVarsUpdate {
  const exists = existsSync(path)
  let vars = exists ? readFileSync(path, 'utf8') : `${DEV_VARS_HEADER}\n`
  const current = parseEnv(vars)
  const names: Array<string> = []

  for (const name of Object.keys(declaration.entries)) {
    const generate = generatorOf(declaration, name)
    const value = current[name]
    if (generate === undefined || (value !== undefined && value !== '' && !isPlaceholder(value))) continue
    const line = devVarsLine(name, generate())
    const existing = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${name}[ \\t]*=.*$`, 'm')
    const separator = vars === '' || vars.endsWith('\n') ? '' : '\n'
    vars = existing.test(vars) ? vars.replace(existing, () => line) : `${vars}${separator}${line}\n`
    names.push(name)
  }

  if (names.length === 0) return { file: 'kept', names }
  writeFileSync(path, vars, { mode: 0o600 })
  return { file: exists ? 'updated' : 'written', names }
}

/** What `ensureDevVars` wrote, as a sentence, when it wrote anything. */
export function describeDevVarsUpdate(update: DevVarsUpdate): string | undefined {
  const written = update.names.join(' and ')
  if (update.file === 'written') return `Wrote .dev.vars with a new ${written} for this computer.`
  if (update.file === 'updated') return `Wrote a new ${written} into .dev.vars.`
  return undefined
}

/**
 * Why the Worker can't start with `.dev.vars` and `wrangler.jsonc`'s vars,
 * if it can't: what src/env.ts says it needs and they don't hold.
 */
export function devVarsProblem(declaration: EnvDeclaration = env, devVarsPath = '.dev.vars'): string | undefined {
  const wranglerVars = readWranglerVars(readFileSync('wrangler.jsonc', 'utf8'))
  const { problems } = checkLocal(declaration, wranglerVars, readDevVars(devVarsPath))
  if (problems.length === 0) return undefined
  return [
    "The app can't start without what src/env.ts says it needs:",
    ...problems.map((problem) => `- ${problem}`),
    'Then run bun run dev again.',
  ].join('\n')
}

/** What applying the local migrations did, so a restart shows it checked too. */
export function describeLocalMigrations(applied: number): string {
  return applied === 0
    ? 'The local database is up to date.'
    : `Applied ${applied} migration${applied === 1 ? '' : 's'} to the local database.`
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
  console.log(describeLocalMigrations(applied))
}

/** Lines of the list of Local Explorer routes shown when an AI agent runs the server. */
const EXPLORER_NOTICE_LINES = 20

/**
 * Rewrites Vite's output for a person, so it names one address to open: it
 * drops Node's punycode deprecation notice, the inspector's port notice and
 * Vite's loopback addresses,
 * shortens the list of routes for AI agents to the Local Explorer's page and
 * API at the app's own address,
 * and once Vite is ready says where to open the app. The agents' list is
 * skipped for at most a few lines, so a change to its wording never hides
 * anything after it.
 */
export function createOutputFilter(appOrigin: string): (line: string) => ReadonlyArray<string> {
  let explorerNoticeLeft = 0
  let skipDeprecationHint = false
  let skipBlankLine = false
  return (line) => {
    const plain = stripVTControlCharacters(line)
    if (plain.includes('detected this dev session is running in an AI agent')) {
      explorerNoticeLeft = EXPLORER_NOTICE_LINES
      return []
    }
    if (explorerNoticeLeft > 0) {
      explorerNoticeLeft = plain.trimEnd().endsWith('- OpenAPI schema') ? 0 : explorerNoticeLeft - 1
      if (!plain.includes('The Local Explorer API is available at')) return []
      const explorer = `${appOrigin}/cdn-cgi/local/explorer`
      return [`Local Explorer, to look at the local database, KV and traces: ${explorer} (its API: ${explorer}/api)`]
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
    // Another app's server has the debugger's usual port; this one takes the next.
    if (plain.includes('Default inspector port')) {
      skipBlankLine = true
      return []
    }
    if (skipBlankLine) {
      skipBlankLine = false
      if (plain.trim() === '') return []
    }
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

  const devVars = describeDevVarsUpdate(ensureDevVars())
  if (devVars !== undefined) console.log(devVars)
  const envProblem = devVarsProblem()
  if (envProblem !== undefined) {
    console.error(envProblem)
    return 1
  }
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
  let interrupted = false
  process.on('SIGINT', () => {
    interrupted = true
  })

  const vite = spawn('vite', [...createViteArguments(session)], {
    stdio: ['inherit', 'pipe', 'pipe'],
    // Vite colours its output only for a terminal; the filter sits between them.
    env: process.stdout.isTTY ? { ...process.env, FORCE_COLOR: '1' } : process.env,
  })
  const filter = createOutputFilter(session.appOrigin)
  pipeLines(vite.stdout, filter, (text) => process.stdout.write(text))
  pipeLines(vite.stderr, filter, (text) => process.stderr.write(text))

  return new Promise((resolve) =>
    vite.on('exit', (code) => {
      if (interrupted) return resolve(0)
      // Stopping on its own, as after a laptop sleeps, leaves the browser on
      // portless's 404 page, so say what to do.
      if (code !== 0) console.error('\nThe dev server stopped. Run bun run dev to start it again.')
      // A Vite ended by a signal has no exit code.
      resolve(code ?? 1)
    })
  )
}

if (import.meta.main) {
  process.exitCode = await runDevelopmentServer()
}
