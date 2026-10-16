import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { nameApp, readDatabaseName } from './app-name'

/**
 * Creates the app's D1 database on Cloudflare, under the name wrangler.jsonc
 * gives it, and writes the new database's id back into wrangler.jsonc.
 */
nameApp()
const databaseName = readDatabaseName(readFileSync('wrangler.jsonc', 'utf8'))
if (databaseName === undefined) {
  console.error('wrangler.jsonc declares no database_name for the DB binding.')
  process.exit(1)
}

// -c names wrangler.jsonc itself: after a build, wrangler otherwise reads the copy in dist/.
execFileSync('wrangler', ['d1', 'create', databaseName, '--binding', 'DB', '--update-config', '-c', 'wrangler.jsonc'], {
  stdio: 'inherit',
})
