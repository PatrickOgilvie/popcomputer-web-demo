import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { getPlatformProxy } from 'wrangler'

import { writeDatabaseId } from './cloudflare-database'

// The project's own wrangler, run here only on a local database in the test's folder.
const wrangler = resolve('node_modules', '.bin', 'wrangler')

/** wrangler.jsonc as the template ships it, its paths made absolute to work from another folder. */
function shippedConfig(): string {
  return readFileSync('wrangler.jsonc', 'utf8')
    .replace('"main": "src/worker.ts"', `"main": ${JSON.stringify(resolve('src/worker.ts'))}`)
    .replace('"directory": "dist"', `"directory": ${JSON.stringify(resolve('dist'))}`)
    .replace('"migrations_dir": "migrations"', `"migrations_dir": ${JSON.stringify(resolve('migrations'))}`)
}

describe('local database', () => {
  test(
    "keeps its data when the first deploy writes the real database's id into wrangler.jsonc",
    async () => {
      const folder = mkdtempSync(join(tmpdir(), 'local-d1-'))
      const configPath = join(folder, 'wrangler.jsonc')
      // `--persist-to` names the folder that holds v3/, as .wrangler/state does.
      const state = join(folder, 'state')
      const execute = (sql: string) =>
        execFileSync(
          wrangler,
          ['d1', 'execute', 'DB', '--local', '--persist-to', state, '-c', configPath, '--json', '--command', sql],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
        )
      try {
        const config = shippedConfig()
        writeFileSync(configPath, config)
        execute("CREATE TABLE notes (body TEXT); INSERT INTO notes VALUES ('written before the first deploy')")

        // As bun run deploy does once Cloudflare has made the database.
        const deployed = writeDatabaseId(config, '4f8a1c2e-7b3d-4e6f-9a0b-1c2d3e4f5a6b')
        expect(deployed).not.toBe(config)
        writeFileSync(configPath, deployed)

        // The db: scripts read it through wrangler's d1 commands...
        const [read] = JSON.parse(execute('SELECT body FROM notes'))
        expect(read.results).toEqual([{ body: 'written before the first deploy' }])

        // ...and bun run dev, through the bindings Cloudflare's Vite plugin and getPlatformProxy share.
        const proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath, persist: { path: join(state, 'v3') } })
        try {
          const { results } = await proxy.env.DB.prepare('SELECT body FROM notes').all()
          expect(results).toEqual([{ body: 'written before the first deploy' }])
        } finally {
          await proxy.dispose()
        }
      } finally {
        rmSync(folder, { recursive: true, force: true })
      }
    },
    { timeout: 60_000 }
  )
})
