import { existsSync, readdirSync } from 'node:fs'

import { capture, failure } from './command'

/** How many migrations a folder holds. */
export function countMigrations(folder: string): number {
  return existsSync(folder) ? readdirSync(folder).filter((file) => file.endsWith('.sql')).length : 0
}

/**
 * The migrations `wrangler d1 migrations list` says are still to apply: the
 * rows of its table, or none after its "No migrations to apply!". Any other
 * output is unknown.
 */
export function readUnappliedMigrations(output: string): ReadonlyArray<string> | undefined {
  if (output.includes('No migrations to apply')) return []
  if (!output.includes('Migrations to be applied')) return undefined
  return [...output.matchAll(/│\s*(\S+\.sql)\s*│/g)].map((match) => match[1] ?? '')
}

/**
 * Lists the migrations the local or the Cloudflare database hasn't had yet.
 * Wrangler creates its table of applied migrations first if the database has
 * none, as on a local database `bun run dev` never started.
 */
export function listUnappliedMigrations(
  where: 'local' | 'remote'
): { readonly unapplied: ReadonlyArray<string> } | { readonly problem: string } {
  const result = capture('wrangler', ['d1', 'migrations', 'list', 'DB', `--${where}`, '-c', 'wrangler.jsonc'])
  const unapplied = result.status === 0 ? readUnappliedMigrations(result.stdout) : undefined
  if (unapplied !== undefined) return { unapplied }
  const database = where === 'local' ? 'the local database' : 'the database on Cloudflare'
  return { problem: failure(result, `Could not list the migrations ${database} hasn't had; wrangler says why above.`) }
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/**
 * One database's migrations in a sentence. `apply` says how to apply any it
 * hasn't had, given "it" or "them".
 */
export function describeMigrations(
  database: string,
  unapplied: ReadonlyArray<string>,
  total: number,
  apply: (them: string) => string
): string {
  if (unapplied.length === 0) return `${database}: up to date, with all ${plural(total, 'migration')} applied.`
  const them = unapplied.length === 1 ? 'it' : 'them'
  return `${database}: ${plural(unapplied.length, 'migration')} not applied yet (${unapplied.join(', ')}); ${apply(them)}.`
}
