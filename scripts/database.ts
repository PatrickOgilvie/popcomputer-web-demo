import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs, type ParseArgsOptionsConfig } from 'node:util'

import { createDb, type Database } from '../src/db'
import type { Bindings } from '../src/env'
import { readDatabaseName } from './app-name'
import { readDatabaseId } from './cloudflare-database'
import { askYesNo, canAsk, runStep } from './command'
import { loginProblem } from './deploy'
import { countAppliedMigrations, describeDevVarsUpdate, ensureDevVars, readRunningDev } from './dev'

/** Where wrangler and `bun run dev` keep the local D1 databases. */
export const LOCAL_D1 = '.wrangler/state/v3/d1'

/** The seed `bun run db:seed` runs without --file. */
export const DEFAULT_SEED = 'src/seed.ts'

/** A statement's text, and the same with its quotes' contents and its comments blanked out. */
interface Statement {
  readonly text: string
  readonly code: string
}

/**
 * Splits SQL at each `;` outside its quotes and comments, keeping the
 * statements that hold more than comments and space. SQLite's quotes are
 * '…', "…", `…` and […]; a doubled quote inside one stands for itself.
 */
function scanStatements(sql: string): ReadonlyArray<Statement> {
  const statements: Array<Statement> = []
  let text = ''
  let code = ''
  let i = 0
  const closers: Record<string, string> = { "'": "'", '"': '"', '`': '`', '[': ']' }
  while (i < sql.length) {
    const char = sql[i] ?? ''
    const next = sql[i + 1] ?? ''
    const closer = closers[char]
    if (closer !== undefined) {
      let end = i + 1
      while (end < sql.length) {
        if (sql[end] === closer && (closer === ']' || sql[end + 1] !== closer)) break
        end += sql[end] === closer ? 2 : 1
      }
      const quoted = sql.slice(i, end + 1)
      text += quoted
      code += `${char}${' '.repeat(Math.max(quoted.length - 2, 0))}${quoted.length > 1 ? closer : ''}`
      i = end + 1
    } else if (char === '-' && next === '-') {
      const end = sql.indexOf('\n', i)
      const comment = sql.slice(i, end === -1 ? sql.length : end)
      text += comment
      code += ' '.repeat(comment.length)
      i += comment.length
    } else if (char === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2)
      const comment = sql.slice(i, end === -1 ? sql.length : end + 2)
      text += comment
      code += ' '.repeat(comment.length)
      i += comment.length
    } else if (char === ';') {
      if (code.trim() !== '') statements.push({ text: text.trim(), code })
      text = ''
      code = ''
      i += 1
    } else {
      text += char
      code += char
      i += 1
    }
  }
  if (code.trim() !== '') statements.push({ text: text.trim(), code })
  return statements
}

/** The statements in some SQL, without the `;` between them. */
export function splitStatements(sql: string): ReadonlyArray<string> {
  return scanStatements(sql).map((statement) => statement.text)
}

/** What a statement inside a WITH can be that writes. */
const WRITES = new Set(['INSERT', 'UPDATE', 'DELETE', 'REPLACE'])

/**
 * Whether a statement only reads. Anything not plainly a read counts as a
 * write, so it's asked about: SELECT, EXPLAIN and VALUES read, a WITH reads
 * unless it inserts, updates or deletes, and a PRAGMA reads unless it sets
 * something with `=`.
 */
export function readsOnly(sql: string): boolean {
  const [statement] = scanStatements(sql)
  if (statement === undefined) return true
  const words = (statement.code.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).map((word) => word.toUpperCase())
  const first = words[0]
  if (first === 'SELECT' || first === 'EXPLAIN' || first === 'VALUES') return true
  if (first === 'WITH') return !words.some((word) => WRITES.has(word))
  if (first === 'PRAGMA') return !statement.code.includes('=')
  return false
}

/** Quotes text for a shell, so a command shown to copy runs as shown. */
export function shellQuote(text: string): string {
  return `'${text.replaceAll("'", "'\\''")}'`
}

/** What to do about a problem, or nothing when there's none. */
type Problem = string | undefined

/**
 * Asks before deleting the local database's data. Without a terminal there's
 * no one to ask, so it stops, saying how to go ahead without asking.
 */
async function confirmReset(rerun: string, yes: boolean): Promise<Problem> {
  if (yes) return undefined
  if (!canAsk()) {
    return `${rerun} deletes everything in the local database, so it asks first, and there's no terminal here to ask in. If that's what you want, run ${rerun} --yes.`
  }
  const ok = await askYesNo('This deletes everything in the local database, then applies the migrations to it again. Go ahead?')
  return ok ? undefined : 'Stopped: the local database is as it was.'
}

/** Why the local database can't be deleted now, if it can't. */
function localDatabaseInUse(rerun: string): Problem {
  if (readRunningDev() === undefined) return undefined
  return `bun run dev is running, with the local database open. Run bun run stop, then ${rerun} again.`
}

/**
 * Deletes the local D1 databases and applies every migration to a new, empty
 * one. Without a terminal on its input, wrangler applies them without asking.
 */
function resetLocalDatabase(): Problem {
  rmSync(LOCAL_D1, { recursive: true, force: true })
  let output: string
  try {
    output = execFileSync('wrangler', ['d1', 'migrations', 'apply', 'DB', '--local', '-c', 'wrangler.jsonc'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    })
  } catch (cause: unknown) {
    if (typeof cause === 'object' && cause !== null && 'stdout' in cause) console.error(String(cause.stdout))
    return 'Deleted the local database, but could not apply the migrations to a new one; wrangler says why above.'
  }
  const applied = countAppliedMigrations(output)
  console.log(`Deleted the local database, and applied ${applied} migration${applied === 1 ? '' : 's'} to a new one.`)
  return undefined
}

/** A command's options and arguments, as parseArgs reads them. */
interface Options {
  readonly values: Readonly<Record<string, string | boolean | ReadonlyArray<string | boolean> | undefined>>
  readonly positionals: ReadonlyArray<string>
}

/** Reads a command's options, or says how to give them. */
function readOptions(argv: ReadonlyArray<string>, options: ParseArgsOptionsConfig, usage: string): Options | string {
  try {
    const { values, positionals } = parseArgs({ args: [...argv], options, allowPositionals: true, strict: true })
    return { values, positionals }
  } catch (cause: unknown) {
    return `${cause instanceof Error ? cause.message : String(cause)}\n${usage}`
  }
}

const RESET_USAGE = 'Usage: bun run db:reset [--yes]'

/** `bun run db:reset`: deletes the local database's data, asking first, and migrates a new one. */
async function reset(argv: ReadonlyArray<string>): Promise<Problem> {
  const options = readOptions(argv, { yes: { type: 'boolean' } }, RESET_USAGE)
  if (typeof options === 'string') return options
  if (options.positionals.length > 0) return `bun run db:reset takes no arguments.\n${RESET_USAGE}`
  const rerun = 'bun run db:reset'
  return localDatabaseInUse(rerun) ?? (await confirmReset(rerun, options.values.yes === true)) ?? resetLocalDatabase()
}

/** A seed module's function: what it writes to the local database. */
type Seed = (db: Database, env: Bindings) => Promise<void> | void

/** The seed function a module exports, as `seed` or as its default. */
export function readSeed(exports: unknown): Seed | undefined {
  if (typeof exports !== 'object' || exports === null) return undefined
  const seed = 'seed' in exports ? exports.seed : 'default' in exports ? exports.default : undefined
  return typeof seed === 'function' ? (seed as Seed) : undefined
}

const SEED_USAGE = 'Usage: bun run db:seed [--yes] [--file path/to/seed.ts or seed.sql]'

/**
 * Runs a TypeScript seed in Bun, on the local D1 database wrangler's
 * platform proxy opens, with the bindings and `.dev.vars` secrets
 * `bun run dev` has.
 */
async function runSeedModule(file: string, seed: Seed): Promise<Problem> {
  const devVars = describeDevVarsUpdate(ensureDevVars())
  if (devVars !== undefined) console.log(devVars)
  const { getPlatformProxy } = await import('wrangler')
  const proxy = await getPlatformProxy<Bindings>({ configPath: 'wrangler.jsonc' })
  try {
    await seed(createDb(proxy.env.DB), proxy.env)
    return undefined
  } catch (cause: unknown) {
    console.error(cause)
    return `${file} failed, as above. The local database has its migrations, and what the seed wrote before it failed; fix the seed, then run bun run db:seed again.`
  } finally {
    await proxy.dispose()
  }
}

/**
 * `bun run db:seed`: deletes the local database's data, asking first,
 * migrates a new one and runs a seed on it: `src/seed.ts`'s seed function, or
 * the file --file names, a .ts or .js module or a .sql file.
 */
async function seed(argv: ReadonlyArray<string>): Promise<Problem> {
  const options = readOptions(argv, { yes: { type: 'boolean' }, file: { type: 'string' } }, SEED_USAGE)
  if (typeof options === 'string') return options
  if (options.positionals.length > 0) return `bun run db:seed takes the seed's path after --file.\n${SEED_USAGE}`
  const file = typeof options.values.file === 'string' ? options.values.file : DEFAULT_SEED
  const rerun = 'bun run db:seed'

  if (!existsSync(file)) {
    return file === DEFAULT_SEED
      ? `There's no ${DEFAULT_SEED} to seed the local database from. Write one that exports a seed function, as the template's does, then run ${rerun} again.`
      : `There's no ${file}. Give the path of a .ts, .js or .sql seed with --file, then run ${rerun} again.`
  }
  let seedFunction: Seed | undefined
  if (!file.endsWith('.sql')) {
    if (!/\.(ts|js|mjs)$/.test(file)) return `bun run db:seed runs a .ts, .js or .sql file, and ${file} is none of them.`
    // Loaded before anything is deleted, so a seed that doesn't load costs nothing.
    seedFunction = readSeed(await import(resolve(file)))
    if (seedFunction === undefined) {
      return `${file} exports no seed function. Export one, as \`export async function seed(db, env)\` or as the default, then run ${rerun} again.`
    }
  }

  const problem =
    localDatabaseInUse(rerun) ?? (await confirmReset(rerun, options.values.yes === true)) ?? resetLocalDatabase()
  if (problem !== undefined) return problem

  const seeded =
    seedFunction === undefined
      ? runStep(
          'wrangler',
          ['d1', 'execute', 'DB', '--local', '-c', 'wrangler.jsonc', '--file', file],
          `Could not run ${file} on the local database; wrangler says why above. The database has its migrations and none of the seed; fix the seed, then run ${rerun} again.`
        )
      : await runSeedModule(file, seedFunction)
  if (seeded === undefined) console.log(`Seeded the local database from ${file}.`)
  return seeded
}

const EXECUTE_USAGE =
  'Usage: bun run db:execute "SELECT * FROM projects" runs one statement on the local database; add --remote to run it on the database on Cloudflare.'

/**
 * Runs one statement with `wrangler d1 execute`, where it prints the result:
 * a table in a terminal, JSON otherwise. Its errors pass through, read for a
 * table that has no migration applied yet.
 */
function runStatement(statement: string, remote: boolean): Problem {
  const where = remote ? '--remote' : '--local'
  const result = spawnSync('wrangler', ['d1', 'execute', 'DB', where, '-c', 'wrangler.jsonc', '--command', statement], {
    encoding: 'utf8',
    stdio: ['ignore', 'inherit', 'pipe'],
  })
  process.stderr.write(result.stderr ?? '')
  if (result.status === 0) return undefined
  const missingTable = (result.stderr ?? '').includes('no such table')
    ? remote
      ? ' If the table is new, bun run deploy applies its migration on Cloudflare.'
      : ' If the table is new, bun run db:migrate:local applies its migration to the local database.'
    : ''
  return `The statement failed; wrangler says why above.${missingTable}`
}

/**
 * `bun run db:execute`: runs one SQL statement on the local database, or with
 * --remote on the database on Cloudflare, asking first, or wanting --yes
 * without a terminal, when the statement could change the live app's data.
 */
async function execute(argv: ReadonlyArray<string>): Promise<Problem> {
  const options = readOptions(argv, { remote: { type: 'boolean' }, yes: { type: 'boolean' } }, EXECUTE_USAGE)
  if (typeof options === 'string') return options
  if (options.positionals.length !== 1) {
    return `Put the SQL in quotes, so it reaches bun run db:execute as one argument.\n${EXECUTE_USAGE}`
  }
  const statements = splitStatements(options.positionals[0] ?? '')
  if (statements.length === 0) return `There's no SQL statement in that.\n${EXECUTE_USAGE}`
  if (statements.length > 1) {
    return `bun run db:execute runs one statement at a time, and that has ${statements.length}. Run each on its own.`
  }
  const statement = statements[0] ?? ''
  if (options.values.remote !== true) return runStatement(statement, false)

  const config = readFileSync('wrangler.jsonc', 'utf8')
  if (readDatabaseId(config) === undefined) {
    return 'The app has no database on Cloudflare yet; bun run deploy creates it. Without --remote, bun run db:execute runs the statement on the local database.'
  }
  const login = loginProblem('bun run db:execute')
  if (login !== undefined) return login
  const database = readDatabaseName(config) ?? 'the database'
  if (!readsOnly(statement) && options.values.yes !== true) {
    const risk = `That statement can change the live app's data, in ${database} on Cloudflare, and bun run rollback won't undo it.`
    if (!canAsk()) {
      return `${risk} So bun run db:execute asks first, and there's no terminal here to ask in. Once you're sure, run it with --yes: bun run db:execute --remote --yes ${shellQuote(statement)}`
    }
    if (!(await askYesNo(`${risk} Run it?`))) return `Didn't run it: ${database} is as it was.`
  }
  // wrangler labels any remote run "preview" once preview_database_id names the local database.
  const label = /"preview_database_id"\s*:/.test(config)
    ? ', though wrangler calls it the preview database, as wrangler.jsonc names the local one with preview_database_id'
    : ''
  console.log(`Running it on ${database}, the live app's database on Cloudflare${label}.`)
  return runStatement(statement, true)
}

const COMMANDS: Record<string, (argv: ReadonlyArray<string>) => Promise<Problem>> = { reset, seed, execute }

if (import.meta.main) {
  const [name = '', ...argv] = process.argv.slice(2)
  const command = COMMANDS[name]
  const problem =
    command === undefined ? `scripts/database.ts runs reset, seed or execute, not "${name}".` : await command(argv)
  if (problem !== undefined) console.error(problem)
  process.exitCode = problem === undefined ? 0 : 1
}
