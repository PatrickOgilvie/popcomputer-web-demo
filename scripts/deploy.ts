import { execFileSync, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Config } from 'drizzle-kit'

import drizzleConfig from '../drizzle.config'
import { nameApp, readDatabaseName } from './app-name'
import { createDatabase, findDatabaseId, readDatabaseId, writeDatabaseId } from './cloudflare-database'

/** The secret Better Auth signs sessions with. Replacing it signs everyone out. */
export const AUTH_SECRET = 'BETTER_AUTH_SECRET'

/** What a command printed, and how it exited. */
export interface CommandResult {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
}

/** Runs a command without a terminal, so it asks nothing, and keeps what it prints. */
function capture(command: string, args: ReadonlyArray<string>): CommandResult {
  const result = spawnSync(command, [...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  // A command that couldn't start at all has only its error to say why.
  const stderr = `${result.stderr ?? ''}${result.error === undefined ? '' : result.error.message}`
  return { status: result.status, stdout: result.stdout ?? '', stderr }
}

/** A captured command's own error output, then what failed. */
function failure(result: CommandResult, what: string): string {
  return [result.stderr.trim(), what].filter((text) => text !== '').join('\n')
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * Runs a step where it reports itself, in this terminal, and says what failed
 * if it did.
 */
function runStep(command: string, args: ReadonlyArray<string>, failed: string): string | undefined {
  try {
    execFileSync(command, [...args], { stdio: 'inherit' })
    return undefined
  } catch {
    return failed
  }
}

/** Whether `src/schema.ts` matches the migrations, as far as drizzle-kit can tell. */
export type SchemaCheck = 'current' | 'changed' | 'failed'

/**
 * Reads drizzle-kit's run against a copy of the migrations. A new migration,
 * or a question about a rename it can't ask without a terminal, means the
 * schema changed. drizzle-kit exits 0 even when it fails, so only its
 * "No schema changes" means there's nothing to generate.
 */
export function readSchemaCheck(output: string, newMigrations: number): SchemaCheck {
  if (newMigrations > 0 || output.includes('Interactive prompts require a TTY')) return 'changed'
  return output.includes('No schema changes') ? 'current' : 'failed'
}

function countMigrations(folder: string): number {
  return existsSync(folder) ? readdirSync(folder).filter((file) => file.endsWith('.sql')).length : 0
}

/**
 * Runs `bun run db:generate`'s drizzle-kit against a copy of the migrations,
 * to see whether the schema has changes no migration holds yet. The copy is
 * under .wrangler/, since drizzle-kit reads its `out` as a path inside the
 * project.
 */
export function checkSchema(config: Config = drizzleConfig): { readonly check: SchemaCheck; readonly output: string } {
  mkdirSync('.wrangler', { recursive: true })
  const folder = mkdtempSync('.wrangler/schema-check-')
  try {
    const migrations = join(folder, 'migrations')
    const out = config.out ?? 'drizzle'
    if (existsSync(out)) cpSync(out, migrations, { recursive: true })
    const before = countMigrations(migrations)
    const copyConfig = join(folder, 'drizzle.config.json')
    writeFileSync(copyConfig, JSON.stringify({ ...config, out: migrations }))

    // The project's own drizzle-kit, so `bun test` finds it as `bun run` does.
    const result = capture(join('node_modules', '.bin', 'drizzle-kit'), ['generate', '--config', copyConfig])
    const output = `${result.stdout}${result.stderr}`
    return { check: readSchemaCheck(output, countMigrations(migrations) - before), output }
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

function schemaProblem(): string | undefined {
  const { check, output } = checkSchema()
  if (check === 'current') return undefined
  if (check === 'changed') {
    return 'src/schema.ts has changes no migration holds yet. Run bun run db:generate to write one, then bun run deploy again.'
  }
  return `${output.trim()}\nCould not compare src/schema.ts with the migrations; drizzle-kit says why above.`
}

/**
 * Whether `wrangler whoami --json` found a login. Without one it prints
 * `{"loggedIn":false}` and exits 1; on any other failure, such as no network,
 * it prints no report at all.
 */
export function readLogin(stdout: string): 'logged-in' | 'logged-out' | undefined {
  const report = parseJson(stdout)
  if (typeof report !== 'object' || report === null || !('loggedIn' in report)) return undefined
  if (report.loggedIn === true) return 'logged-in'
  if (report.loggedIn === false) return 'logged-out'
  return undefined
}

/** What to do when wrangler has no Cloudflare login. */
export const LOGIN_PROBLEM =
  'Wrangler is not signed in to Cloudflare. Run bun run cloudflare:login, which opens a browser to allow it into your Cloudflare account, then run bun run deploy again.'

function loginProblem(): string | undefined {
  const whoami = capture('wrangler', ['whoami', '--json'])
  const login = readLogin(whoami.stdout)
  if (login === 'logged-in') return undefined
  if (login === 'logged-out') return LOGIN_PROBLEM
  return failure(whoami, 'Could not check the Cloudflare login; wrangler says why above.')
}

/**
 * Gives the app a D1 database of its own, unless wrangler.jsonc names one
 * already. A database the app made before, whose id wrangler.jsonc lost, is
 * found by its name rather than made again.
 */
function databaseProblem(path = 'wrangler.jsonc'): string | undefined {
  const config = readFileSync(path, 'utf8')
  if (readDatabaseId(config) !== undefined) return undefined
  const name = readDatabaseName(config)
  if (name === undefined) return 'wrangler.jsonc declares no database_name for the DB binding.'

  const list = capture('wrangler', ['d1', 'list', '--json', '-c', 'wrangler.jsonc'])
  if (list.status !== 0) return failure(list, 'Could not list the D1 databases on Cloudflare; wrangler says why above.')
  const id = findDatabaseId(list.stdout, name)
  if (id !== undefined) {
    writeFileSync(path, writeDatabaseId(config, id))
    console.log(`Found the database ${name} on Cloudflare, and wrote its id into wrangler.jsonc.`)
    return undefined
  }

  try {
    createDatabase(name)
  } catch {
    return `Could not create the database ${name}; wrangler says why above.`
  }
  // A build copies wrangler.jsonc, so the id must be there before it runs.
  if (readDatabaseId(readFileSync(path, 'utf8')) === undefined) {
    return `Wrangler created the database ${name} but didn't write its id into wrangler.jsonc. Copy the database_id it printed into the DB binding there, then run bun run deploy again.`
  }
  return undefined
}

/** Matches wrangler's error for a Worker that hasn't been deployed yet. */
const WORKER_NOT_FOUND = /Worker "[^"]+"(?: \(env: [^)]*\))? not found/

/**
 * Whether `wrangler secret list` shows the secret. A Worker that doesn't exist
 * yet, before its first deploy, has none; any other failure is unknown.
 */
export function readSecret(result: CommandResult, name: string): 'set' | 'missing' | undefined {
  if (result.status !== 0) return WORKER_NOT_FOUND.test(result.stderr) ? 'missing' : undefined
  const parsed = parseJson(result.stdout)
  if (!Array.isArray(parsed)) return undefined
  const secrets: ReadonlyArray<unknown> = parsed
  const found = secrets.some(
    (secret) => typeof secret === 'object' && secret !== null && 'name' in secret && secret.name === name
  )
  return found ? 'set' : 'missing'
}

/**
 * Uploads a new Better Auth secret when the Worker has none, and never
 * replaces one, so a redeploy keeps everyone signed in. Before the first
 * deploy, wrangler creates the Worker, empty, to hold it.
 */
function secretProblem(): string | undefined {
  const list = capture('wrangler', ['secret', 'list', '-c', 'wrangler.jsonc'])
  const secret = readSecret(list, AUTH_SECRET)
  if (secret === 'set') return undefined
  if (secret === undefined) return failure(list, "Could not list the Worker's secrets; wrangler says why above.")

  try {
    // On wrangler's input, the secret is never shown, and kept nowhere else.
    execFileSync('wrangler', ['secret', 'put', AUTH_SECRET, '-c', 'wrangler.jsonc'], {
      input: randomBytes(32).toString('base64'),
      stdio: ['pipe', 'inherit', 'inherit'],
    })
  } catch {
    return `Could not upload ${AUTH_SECRET}; wrangler says why above.`
  }
  return undefined
}

/**
 * The workers.dev address `wrangler deploy` reports in the file
 * WRANGLER_OUTPUT_FILE_PATH names: a line of JSON for each event, the
 * deploy's listing what it serves. Only workers.dev addresses start https://.
 */
export function readDeployUrl(output: string): string | undefined {
  for (const line of output.split('\n')) {
    const event = parseJson(line)
    if (typeof event !== 'object' || event === null || !('type' in event) || event.type !== 'deploy') continue
    if (!('targets' in event) || !Array.isArray(event.targets)) continue
    const targets: ReadonlyArray<unknown> = event.targets
    for (const target of targets) {
      if (typeof target === 'string' && target.startsWith('https://') && target.endsWith('.workers.dev')) return target
    }
  }
  return undefined
}

/** Deploys the build, and says where the app is now and how to watch or undo it. */
function deployWorker(): string | undefined {
  const folder = mkdtempSync(join(tmpdir(), 'wrangler-deploy-'))
  try {
    const outputFile = join(folder, 'output.json')
    // Without -c, wrangler deploys the build's copy of wrangler.jsonc, beside the Worker in dist/.
    execFileSync('wrangler', ['deploy'], {
      stdio: 'inherit',
      env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: outputFile },
    })
    const url = existsSync(outputFile) ? readDeployUrl(readFileSync(outputFile, 'utf8')) : undefined
    console.log(url === undefined ? '\nDeployed.' : `\nDeployed to ${url}`)
    console.log(
      'bun run logs shows its requests and errors as they happen, and bun run rollback goes back to the deploy before.'
    )
    return undefined
  } catch {
    return 'Could not deploy the Worker; wrangler says why above.'
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

/**
 * Deploys the app, and is safe to run again at any time. Each run checks the
 * schema has its migrations and wrangler is signed in, creates only what the
 * app doesn't have yet on Cloudflare, then builds, migrates and deploys.
 */
function deploy(): number {
  const name = nameApp()
  if (name !== undefined) console.log(`Named the Worker ${name} and its database ${name}-db in wrangler.jsonc.`)

  const steps: ReadonlyArray<() => string | undefined> = [
    schemaProblem,
    loginProblem,
    () => databaseProblem(),
    secretProblem,
    () => runStep('bun', ['run', 'build'], 'The build failed; it says why above.'),
    () => runStep('bun', ['run', 'db:migrate'], 'Could not apply the migrations on Cloudflare; wrangler says why above.'),
    deployWorker,
  ]
  for (const step of steps) {
    const problem = step()
    if (problem !== undefined) {
      console.error(problem)
      return 1
    }
  }
  return 0
}

if (import.meta.main) {
  process.exitCode = deploy()
}
