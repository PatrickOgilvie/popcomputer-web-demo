import { execFileSync } from 'node:child_process'

/** The database_id wrangler.jsonc ships with, until the app has a database of its own. */
export const PLACEHOLDER_DATABASE_ID = '00000000-0000-0000-0000-000000000000'

/** The D1 database id wrangler.jsonc declares, unless it is still the template's placeholder. */
export function readDatabaseId(config: string): string | undefined {
  const id = /"database_id":\s*"([^"]+)"/.exec(config)?.[1]
  return id === PLACEHOLDER_DATABASE_ID ? undefined : id
}

/** Puts a database's id in place of the template's placeholder; an id already there is kept. */
export function writeDatabaseId(config: string, id: string): string {
  return config.replace(`"database_id": "${PLACEHOLDER_DATABASE_ID}"`, `"database_id": "${id}"`)
}

/**
 * The id of the database `wrangler d1 list --json` lists under this name, for
 * when wrangler.jsonc lost the id of a database the app already made.
 */
export function findDatabaseId(list: string, name: string): string | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(list)
  } catch {
    return undefined
  }
  if (!Array.isArray(parsed)) return undefined
  const databases: ReadonlyArray<unknown> = parsed
  for (const database of databases) {
    if (typeof database !== 'object' || database === null) continue
    if (!('name' in database) || database.name !== name) continue
    if ('uuid' in database && typeof database.uuid === 'string') return database.uuid
  }
  return undefined
}

/**
 * Creates the app's D1 database on Cloudflare, under the name wrangler.jsonc
 * gives it, and writes the new database's id into the DB binding there.
 */
export function createDatabase(name: string): void {
  // -c names wrangler.jsonc itself: after a build, wrangler otherwise reads the copy in dist/.
  execFileSync('wrangler', ['d1', 'create', name, '--binding', 'DB', '--update-config', '-c', 'wrangler.jsonc'], {
    stdio: 'inherit',
  })
}
