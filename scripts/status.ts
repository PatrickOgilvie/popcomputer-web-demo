import { readFileSync } from 'node:fs'

import { readDatabaseName } from './app-name'
import { readDatabaseId } from './cloudflare-database'
import { capture, failure } from './command'
import { loginProblem } from './deploy'
import { countMigrations, describeMigrations, listUnappliedMigrations } from './migrations'
import { describeLiveDeployment, readLiveDeployment } from './versions'

const RERUN = 'bun run status'

/** What's live on Cloudflare, in a sentence. */
function liveStatus(): { readonly line: string } | { readonly problem: string } {
  const result = capture('wrangler', ['deployments', 'status', '--json', '-c', 'wrangler.jsonc'])
  const live = readLiveDeployment(result)
  if (live === undefined) return { problem: failure(result, "Could not read what's live on Cloudflare; wrangler says why above.") }
  if (live === 'none') return { line: 'Live: nothing yet. bun run deploy deploys the app.' }
  return { line: describeLiveDeployment(live, new Date()) }
}

/** The database on Cloudflare's migrations, in a sentence. */
function remoteMigrationStatus(config: string, total: number): { readonly line: string } | { readonly problem: string } {
  const name = readDatabaseName(config) ?? 'DB'
  if (readDatabaseId(config) === undefined) {
    return { line: 'Database on Cloudflare: none yet. bun run deploy creates it.' }
  }
  const listed = listUnappliedMigrations('remote')
  if ('problem' in listed) return listed
  const apply = (them: string) => `bun run deploy applies ${them}`
  return { line: describeMigrations(`Database on Cloudflare (${name})`, listed.unapplied, total, apply) }
}

/** The local database's migrations, in a sentence. */
function localMigrationStatus(total: number): { readonly line: string } | { readonly problem: string } {
  const listed = listUnappliedMigrations('local')
  if ('problem' in listed) return listed
  const apply = (them: string) => `bun run dev applies ${them} as it starts, or bun run db:migrate:local now`
  return { line: describeMigrations('Local database', listed.unapplied, total, apply) }
}

/**
 * Says what's live on Cloudflare and whether each database has every
 * migration. Without a Cloudflare login it still says how the local database
 * is, then how to sign in.
 */
function status(): number {
  const config = readFileSync('wrangler.jsonc', 'utf8')
  const total = countMigrations('migrations')
  const login = loginProblem(RERUN)
  const reports = [
    ...(login === undefined ? [liveStatus(), remoteMigrationStatus(config, total)] : [{ problem: login }]),
    localMigrationStatus(total),
  ]

  for (const report of reports) if ('line' in report) console.log(report.line)
  const problems = reports.flatMap((report) => ('problem' in report ? [report.problem] : []))
  for (const problem of problems) console.error(problem)
  return problems.length === 0 ? 0 : 1
}

if (import.meta.main) {
  process.exitCode = status()
}
