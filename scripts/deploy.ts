import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Config } from 'drizzle-kit'

import drizzleConfig from '../drizzle.config'
import { nameApp, readDatabaseName } from './app-name'
import { createDatabase, findDatabaseId, readDatabaseId, writeDatabaseId } from './cloudflare-database'
import { capture, failure, parseJson, runStep, runWrangler, type CommandResult } from './command'
import { countMigrations } from './migrations'
import {
  checkAnswers,
  type CheckOptions,
  READINESS_PATH,
  readWorkersDevUrl,
  servesWorkersDev,
  shortVersion,
  turnsOffVersionUrls,
  uploadVersion,
} from './versions'

/** The secret Better Auth signs sessions with. Replacing it signs everyone out. */
export const AUTH_SECRET = 'BETTER_AUTH_SECRET'

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

/** Why `src/schema.ts` can't be deployed yet, if it can't; `rerun` is the command to run once it's fixed. */
export function schemaProblem(rerun: string): string | undefined {
  const { check, output } = checkSchema()
  if (check === 'current') return undefined
  if (check === 'changed') {
    return `src/schema.ts has changes no migration holds yet. Run bun run db:generate to write one, then ${rerun} again.`
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

/**
 * What to do when wrangler has no Cloudflare login: on a computer, sign in
 * through the browser; in CI, which has no browser, give it an API token.
 */
export function loginAdvice(rerun: string, ci = process.env.CI === 'true'): string {
  if (ci) {
    return `Wrangler has no Cloudflare login here. Set the CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID secrets, as the README's "Deploying from GitHub" says, then run ${rerun} again.`
  }
  return `Wrangler is not signed in to Cloudflare. Run bun run cloudflare:login, which opens a browser to allow it into your Cloudflare account, then run ${rerun} again.`
}

/** Why wrangler can't reach the Cloudflare account, if it can't. */
export function loginProblem(rerun: string): string | undefined {
  const whoami = capture('wrangler', ['whoami', '--json'])
  const login = readLogin(whoami.stdout)
  if (login === 'logged-in') return undefined
  if (login === 'logged-out') return loginAdvice(rerun)
  const token =
    process.env.CLOUDFLARE_API_TOKEN === undefined
      ? ''
      : ' Check CLOUDFLARE_API_TOKEN is current and has the permissions the README\'s "Deploying from GitHub" lists.'
  return failure(whoami, `Could not check the Cloudflare login; wrangler says why above.${token}`)
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
export function readSecret(result: CommandResult, name: string): 'set' | 'missing' | 'no-worker' | undefined {
  if (result.status !== 0) return WORKER_NOT_FOUND.test(result.stderr) ? 'no-worker' : undefined
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
 * deploy, wrangler creates the Worker, empty, to hold it, and `onNewWorker`
 * hears of it.
 */
function secretProblem(onNewWorker: () => void): string | undefined {
  const list = capture('wrangler', ['secret', 'list', '-c', 'wrangler.jsonc'])
  const secret = readSecret(list, AUTH_SECRET)
  if (secret === 'set') return undefined
  if (secret === undefined) return failure(list, "Could not list the Worker's secrets; wrangler says why above.")
  if (secret === 'no-worker') onNewWorker()

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
 * The workers.dev address `wrangler deploy` reports among its events: the
 * deploy's lists what it serves, and only workers.dev addresses start https://.
 */
export function readDeployUrl(events: ReadonlyArray<object>): string | undefined {
  for (const event of events) {
    if (!('type' in event) || event.type !== 'deploy') continue
    if (!('targets' in event) || !Array.isArray(event.targets)) continue
    const targets: ReadonlyArray<unknown> = event.targets
    for (const target of targets) {
      if (typeof target === 'string' && target.startsWith('https://') && target.endsWith('.workers.dev')) return target
    }
  }
  return undefined
}

const RERUN = 'bun run deploy'

/** What to run after a deploy; a first deploy has none before it to roll back to. */
function afterDeploy(first: boolean): string {
  const watch = 'bun run logs shows its requests and errors as they happen'
  return first
    ? `${watch}, and bun run status shows what is live.`
    : `${watch}, bun run status shows what is live, and bun run rollback goes back to the deploy before.`
}

/**
 * Deploys the build straight to the Worker's traffic, as `wrangler deploy`
 * does, then checks it answers: for a first deploy, with no live version to
 * keep, or a version with no address of its own to be checked at first.
 */
export async function deployDirectly(
  reason: string,
  { first, check }: { readonly first: boolean; readonly check?: CheckOptions }
): Promise<string | undefined> {
  console.log(`\n${reason}`)
  const run = runWrangler(['deploy', '--message', RERUN])
  if (!run.ok) return 'Could not deploy the Worker; wrangler says why above.'

  const url = readDeployUrl(run.events)
  if (url === undefined) {
    console.log("\nDeployed. It has no workers.dev address, so bun run deploy couldn't check it answers.")
    console.log(afterDeploy(first))
    return undefined
  }
  const page = `${url}${READINESS_PATH}`
  console.log(`\nDeployed to ${url}. Checking it answers at ${page}, for up to 30 seconds...`)
  const answer = await checkAnswers(page, check)
  if (answer.kind === 'failed') {
    const next = first
      ? "A new workers.dev address can take a few minutes to start answering, so open it again shortly. If it still doesn't answer, run bun run logs while you open it to see why."
      : 'Run bun run logs while you open it to see why, or bun run rollback to go back to the deploy before.'
    return `It's live, but ${page} didn't answer: ${answer.reason}. ${next}`
  }
  console.log(
    answer.kind === 'ready'
      ? `It answers at ${page}.`
      : "Cloudflare Access asks visitors to sign in there, so bun run deploy couldn't check it answers."
  )
  console.log(afterDeploy(first))
  return undefined
}

/**
 * Uploads the build as a new version beside the live one, checks it answers
 * at its own Version URL, and only then sends it the Worker's traffic. A
 * version that doesn't answer never goes live.
 */
export async function deployStaged(check?: CheckOptions): Promise<string | undefined> {
  const upload = uploadVersion(RERUN)
  if (upload.kind === 'no-worker') {
    return deployDirectly('The Worker has no live version yet, so the build goes live with wrangler deploy, and is checked there.', {
      first: true,
      check,
    })
  }
  if (upload.kind === 'failed') return 'Could not upload the new version; wrangler says why above. The live version is unchanged.'

  const { versionId, previewUrl } = upload.version
  const version = `version ${shortVersion(versionId)}`
  const config = readFileSync('wrangler.jsonc', 'utf8')
  if (previewUrl === undefined) {
    const why = turnsOffVersionUrls(config)
      ? 'preview_urls is false in wrangler.jsonc'
      : 'a full deploy turns Version URLs on for the Worker'
    return deployDirectly(
      `The new ${version} has no Version URL to be checked at before it goes live (${why}), so the build goes live with wrangler deploy, and is checked there.`,
      { first: false, check }
    )
  }

  const page = `${previewUrl}${READINESS_PATH}`
  console.log(`\nChecking the new ${version} answers at ${page} before it goes live, for up to 30 seconds...`)
  const answer = await checkAnswers(page, check)
  if (answer.kind === 'behind-access') {
    return deployDirectly(
      `Cloudflare Access asks visitors to sign in at ${previewUrl}, so the check can't see the app there. The build goes live with wrangler deploy instead.`,
      { first: false, check }
    )
  }
  if (answer.kind === 'failed') {
    return `The new ${version} didn't answer at ${page}: ${answer.reason}. It isn't live: the live version is unchanged. Open that address to see what's wrong, fix it, then run bun run deploy again. Migrations this run applied stay applied, as after a rollback.`
  }

  console.log(`It answers, so ${version} goes live now.`)
  if (!runWrangler(['versions', 'deploy', `${versionId}@100%`, '--yes', '--message', RERUN]).ok) {
    return `Could not make ${version} live; wrangler says why above. The live version is unchanged; run bun run deploy again.`
  }
  // `versions deploy` moves the traffic only; the cron schedule and the
  // workers.dev settings in wrangler.jsonc follow with `triggers deploy`.
  if (!runWrangler(['triggers', 'deploy']).ok) {
    return `The new ${version} is live, but Cloudflare didn't take the cron schedule and workers.dev settings in wrangler.jsonc; wrangler says why above. Run bun run deploy again to apply them.`
  }

  const url = servesWorkersDev(config) ? readWorkersDevUrl(previewUrl) : undefined
  const checked = `${version}, which answered at its Version URL before it went live.`
  console.log(url === undefined ? `\nDeployed ${checked}` : `\nDeployed to ${url}: ${checked}`)
  console.log(afterDeploy(false))
  return undefined
}

/**
 * Deploys the app, and is safe to run again at any time. Each run checks the
 * schema has its migrations and wrangler is signed in, creates only what the
 * app doesn't have yet on Cloudflare, then builds, migrates and deploys: a
 * new version goes live only once it answers at its own address.
 */
async function deploy(): Promise<number> {
  const name = nameApp()
  if (name !== undefined) console.log(`Named the Worker ${name} and its database ${name}-db in wrangler.jsonc.`)

  let newWorker = false
  const steps: ReadonlyArray<() => string | undefined | Promise<string | undefined>> = [
    () => schemaProblem(RERUN),
    () => loginProblem(RERUN),
    () => databaseProblem(),
    () =>
      secretProblem(() => {
        newWorker = true
      }),
    () => runStep('bun', ['run', 'build'], 'The build failed; it says why above.'),
    () => runStep('bun', ['run', 'db:migrate'], 'Could not apply the migrations on Cloudflare; wrangler says why above.'),
    () =>
      newWorker
        ? deployDirectly(
            "This is the app's first deploy, so there's no live version to keep while the new one is checked: it goes live with wrangler deploy, and is checked there.",
            { first: true }
          )
        : deployStaged(),
  ]
  for (const step of steps) {
    const problem = await step()
    if (problem !== undefined) {
      console.error(problem)
      return 1
    }
  }
  return 0
}

if (import.meta.main) {
  process.exitCode = await deploy()
}
