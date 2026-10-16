import { describe, expect, spyOn, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { Schema as S } from 'effect'
import { defineEnv, randomSecret, secret, variable, type EnvDeclaration } from '@popcomputer/web/env'

import drizzleConfig from '../drizzle.config'
import { env } from '../src/env'
import { findDatabaseId, PLACEHOLDER_DATABASE_ID, readDatabaseId, writeDatabaseId } from './cloudflare-database'
import { readEvents } from './command'
import {
  checkSchema,
  deployDirectly,
  deployStaged,
  envProblem,
  loginAdvice,
  readDeployUrl,
  readLogin,
  readSchemaCheck,
} from './deploy'
import { fakeWrangler } from './fake-wrangler'

describe('Cloudflare login', () => {
  test('reads a login from wrangler whoami --json', () => {
    const report = JSON.stringify(
      {
        loggedIn: true,
        authType: 'OAuth Token',
        email: 'ada@example.com',
        accounts: [{ id: '0123456789abcdef0123456789abcdef', name: "Ada's Account" }],
      },
      null,
      4
    )

    expect(readLogin(report)).toBe('logged-in')
  })

  test('reads no login from the report wrangler prints, exiting 1, without one', () => {
    expect(readLogin('{"loggedIn":false}\n')).toBe('logged-out')
  })

  test('reads neither when wrangler failed some other way', () => {
    expect(readLogin('')).toBeUndefined()
    expect(readLogin('✘ [ERROR] A request to the Cloudflare API failed.')).toBeUndefined()
  })

  test('says to sign in through the browser on a computer, and to set the token in CI', () => {
    expect(loginAdvice('bun run status', false)).toContain('Run bun run cloudflare:login')
    expect(loginAdvice('bun run status', false)).toEndWith('then run bun run status again.')
    expect(loginAdvice('bun run deploy', true)).toContain('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID')
    expect(loginAdvice('bun run deploy', true)).not.toContain('cloudflare:login')
  })
})

describe('database', () => {
  const config = (id: string) => `{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "book-club-db",
      "database_id": "${id}",
      "migrations_dir": "migrations"
    }
  ]
}`
  const id = '4f8a1c2e-7b3d-4e6f-9a0b-1c2d3e4f5a6b'

  test("reads the template's placeholder as no database yet", () => {
    expect(readDatabaseId(config(PLACEHOLDER_DATABASE_ID))).toBeUndefined()
    expect(readDatabaseId(config(id))).toBe(id)
  })

  test("writes an id only in place of the placeholder", () => {
    expect(writeDatabaseId(config(PLACEHOLDER_DATABASE_ID), id)).toBe(config(id))
    expect(writeDatabaseId(config(id), '00000000-1111-2222-3333-444444444444')).toBe(config(id))
  })

  test("reads and writes database_id only, leaving the local database's preview_database_id", () => {
    const withLocal = (databaseId: string) =>
      `{ "binding": "DB", "database_id": "${databaseId}", "preview_database_id": "${PLACEHOLDER_DATABASE_ID}" }`

    expect(readDatabaseId(withLocal(PLACEHOLDER_DATABASE_ID))).toBeUndefined()
    expect(writeDatabaseId(withLocal(PLACEHOLDER_DATABASE_ID), id)).toBe(withLocal(id))
  })

  test('finds the database wrangler d1 list --json names', () => {
    const list = JSON.stringify(
      [
        { uuid: '9e9e9e9e-0000-4000-8000-000000000000', name: 'reading-list-db', version: 'production' },
        { uuid: id, name: 'book-club-db', version: 'production', num_tables: 7 },
      ],
      null,
      2
    )

    expect(findDatabaseId(list, 'book-club-db')).toBe(id)
    expect(findDatabaseId(list, 'recipes-db')).toBeUndefined()
    expect(findDatabaseId('✘ [ERROR] Authentication error', 'book-club-db')).toBeUndefined()
  })
})

describe("the Worker's vars and secrets", () => {
  // An app that has added a mail service's key to the template's declaration.
  const mailing = defineEnv({
    BETTER_AUTH_SECRET: secret(S.String.check(S.isMinLength(32)), { generate: randomSecret }),
    RESEND_API_KEY: secret(S.String.check(S.isStartingWith('re_'))),
    ENVIRONMENT: variable(S.Literals(['development', 'production', 'test'])),
  })
  const listed = (...names: ReadonlyArray<string>) => ({
    stdout: JSON.stringify(names.map((name) => ({ name, type: 'secret_text' }))),
  })
  const list = ['secret', 'list', '-c', 'wrangler.jsonc']

  /** Runs the deploy's env step with the fake wrangler, and says whether it heard of a new Worker. */
  function withWrangler(plan: Parameters<typeof fakeWrangler>[0], declaration: EnvDeclaration = mailing) {
    const wrangler = fakeWrangler(plan)
    const log = spyOn(console, 'log').mockImplementation(() => {})
    let newWorker = false
    try {
      const problem = envProblem(() => {
        newWorker = true
      }, declaration)
      return { problem, newWorker, calls: wrangler.calls() }
    } finally {
      log.mockRestore()
      wrangler.restore()
    }
  }

  test('refuses before changing anything on Cloudflare while a secret nothing generates is missing', () => {
    const { problem, calls } = withWrangler({ 'secret list': listed() })

    expect(problem).toBe(
      [
        'Not deploying: the Worker would start without what src/env.ts says it needs.',
        "- The secret RESEND_API_KEY isn't set on Cloudflare. Run bun run secret RESEND_API_KEY to set it.",
        'Then run bun run deploy again.',
      ].join('\n')
    )
    expect(calls).toEqual([list])
  })

  test('uploads a new value for each secret it generates that is missing, and never replaces one', () => {
    expect(withWrangler({ 'secret list': listed('RESEND_API_KEY') }).calls).toEqual([
      list,
      ['secret', 'put', 'BETTER_AUTH_SECRET', '-c', 'wrangler.jsonc'],
    ])
    expect(withWrangler({ 'secret list': listed('BETTER_AUTH_SECRET', 'RESEND_API_KEY') }).calls).toEqual([list])
  })

  test("hears there's no Worker before the first deploy, so the build goes live directly", () => {
    const notFound = { status: 1, stderr: '✘ [ERROR] Worker "book-club" not found.' }
    const { problem, newWorker, calls } = withWrangler({ 'secret list': notFound }, env)

    expect(problem).toBeUndefined()
    expect(newWorker).toBe(true)
    expect(calls).toEqual([list, ['secret', 'put', 'BETTER_AUTH_SECRET', '-c', 'wrangler.jsonc']])
  })

  test('stops when wrangler cannot list the secrets', () => {
    const failed = { status: 1, stderr: '✘ [ERROR] A request to the Cloudflare API failed.' }

    expect(withWrangler({ 'secret list': failed }).problem).toBe(
      "✘ [ERROR] A request to the Cloudflare API failed.\nCould not list the Worker's secrets; wrangler says why above."
    )
  })
})

describe('schema check', () => {
  test("passes when drizzle-kit finds the migrations hold every change", () => {
    expect(readSchemaCheck('6 tables\n\nNo schema changes, nothing to migrate 😴\n', 0)).toBe('current')
  })

  test('refuses a change drizzle-kit writes a migration for', () => {
    const output = '[✓] Your SQL migration file ➜ .wrangler/schema-check-x/migrations/0001_long_captain_universe.sql 🚀'

    expect(readSchemaCheck(output, 1)).toBe('changed')
  })

  test("refuses a change drizzle-kit can't write without asking about a rename", () => {
    const output =
      'Error: Interactive prompts require a TTY terminal (process.stdin.isTTY or process.stdout.isTTY is false).'

    expect(readSchemaCheck(output, 0)).toBe('changed')
  })

  test('fails when drizzle-kit fails, though it exits 0', () => {
    const output = 'Error: Transform failed with 1 error:\nsrc/schema.ts:28:0: ERROR: Unexpected end of file'

    expect(readSchemaCheck(output, 0)).toBe('failed')
  })

  test("finds the template's schema and migrations match, and leaves migrations/ as it was", () => {
    const before = readdirSync('migrations', { recursive: true })

    expect(checkSchema().check).toBe('current')
    expect(readdirSync('migrations', { recursive: true })).toEqual(before)
  })

  test('finds a table no migration creates', () => {
    mkdirSync('.wrangler', { recursive: true })
    const folder = mkdtempSync('.wrangler/schema-test-')
    try {
      const schema = join(folder, 'schema.ts')
      writeFileSync(
        schema,
        [
          "import { sqliteTable, text } from 'drizzle-orm/sqlite-core'",
          "export * from '../../src/schema'",
          "export const notes = sqliteTable('notes', { id: text('id').primaryKey() })",
          '',
        ].join('\n')
      )

      expect(checkSchema({ ...drizzleConfig, schema }).check).toBe('changed')
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})

describe('deploy address', () => {
  // wrangler's output file after a deploy, one JSON event a line.
  const output = (targets: ReadonlyArray<string>) =>
    [
      JSON.stringify({ version: 1, type: 'wrangler-session', wrangler_version: '4.151.0', command_line_args: ['deploy'] }),
      JSON.stringify({ version: 1, type: 'deploy', worker_name: 'book-club', version_id: 'a1b2c3', targets }),
      '',
    ].join('\n')

  test('reads the workers.dev address among what the deploy serves', () => {
    const url = readDeployUrl(readEvents(output(['https://book-club.ada.workers.dev', 'schedule: 0 3 * * *'])))

    expect(url).toBe('https://book-club.ada.workers.dev')
  })

  test('reads none when the Worker serves no workers.dev address', () => {
    const events = readEvents(output(['books.example.com (custom domain)', 'schedule: 0 3 * * *']))

    expect(readDeployUrl(events)).toBeUndefined()
    expect(readDeployUrl(readEvents(''))).toBeUndefined()
  })
})

describe('staged deploy', () => {
  const versionId = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
  const quick = { attempts: 2, intervalMs: 0 }

  /** A stand-in for the new version's Version URL, answering each request with `status`. */
  function versionAt(status: number) {
    const requests: Array<string> = []
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch(request) {
        requests.push(new URL(request.url).pathname)
        return new Response('page', { status })
      },
    })
    return { url: `http://127.0.0.1:${server.port}`, requests, stop: () => server.stop(true) }
  }

  const uploaded = (previewUrl?: string) => ({
    events: [{ type: 'version-upload', version: 1, worker_name: 'book-club', version_id: versionId, preview_url: previewUrl ?? null }],
  })

  /** Runs `run` with the fake wrangler and console.log quiet, then puts both back. */
  async function withWrangler<T>(plan: Parameters<typeof fakeWrangler>[0], run: (wrangler: ReturnType<typeof fakeWrangler>) => Promise<T>) {
    const wrangler = fakeWrangler(plan)
    const log = spyOn(console, 'log').mockImplementation(() => {})
    try {
      return await run(wrangler)
    } finally {
      log.mockRestore()
      wrangler.restore()
    }
  }

  test('makes the new version live once it answers at its Version URL, then applies the triggers', async () => {
    const version = versionAt(200)
    try {
      const calls = await withWrangler({ 'versions upload': uploaded(version.url) }, async (wrangler) => {
        expect(await deployStaged(quick)).toBeUndefined()
        return wrangler.calls()
      })

      expect(version.requests).toEqual(['/login'])
      expect(calls).toEqual([
        ['versions', 'upload', '--message', 'bun run deploy'],
        ['versions', 'deploy', `${versionId}@100%`, '--yes', '--message', 'bun run deploy'],
        ['triggers', 'deploy'],
      ])
    } finally {
      version.stop()
    }
  })

  test("leaves the live version alone when the new one doesn't answer, and says why", async () => {
    const version = versionAt(500)
    try {
      const { problem, calls } = await withWrangler({ 'versions upload': uploaded(version.url) }, async (wrangler) => ({
        problem: await deployStaged(quick),
        calls: wrangler.calls(),
      }))

      expect(problem).toContain(`didn't answer at ${version.url}/login: it answered with status 500`)
      expect(problem).toContain("It isn't live: the live version is unchanged.")
      expect(problem).toContain('then run bun run deploy again')
      expect(calls).toEqual([['versions', 'upload', '--message', 'bun run deploy']])
    } finally {
      version.stop()
    }
  })

  test('goes live with wrangler deploy when the version has no Version URL to be checked at', async () => {
    const calls = await withWrangler({ 'versions upload': uploaded(), deploy: { events: [] } }, async (wrangler) => {
      expect(await deployStaged(quick)).toBeUndefined()
      return wrangler.calls()
    })

    expect(calls).toEqual([
      ['versions', 'upload', '--message', 'bun run deploy'],
      ['deploy', '--message', 'bun run deploy'],
    ])
  })

  test("checks the live address after wrangler deploy, and says what to do when it doesn't answer", async () => {
    const asked: Array<string> = []
    const check = {
      attempts: 1,
      fetch: async (url: string) => {
        asked.push(url)
        return new Response(null, { status: 503 })
      },
    }
    const live = { type: 'deploy', version: 1, version_id: versionId, targets: ['https://book-club.ada.workers.dev', 'schedule: 0 3 * * *'] }
    const problem = await withWrangler({ 'versions upload': uploaded(), deploy: { events: [live] } }, () =>
      deployStaged(check)
    )

    expect(asked).toEqual(['https://book-club.ada.workers.dev/login'])
    expect(problem).toContain("It's live, but https://book-club.ada.workers.dev/login didn't answer: it answered with status 503.")
    expect(problem).toContain('bun run rollback')
  })

  test("doesn't suggest a rollback after a first deploy, which has nothing before it", async () => {
    const check = { attempts: 1, fetch: async () => new Response(null, { status: 500 }) }
    const live = { type: 'deploy', version: 1, version_id: versionId, targets: ['https://book-club.ada.workers.dev'] }
    const problem = await withWrangler({ deploy: { events: [live] } }, () =>
      deployDirectly("This is the app's first deploy.", { first: true, check })
    )

    expect(problem).toContain('run bun run logs while you open it')
    expect(problem).not.toContain('rollback')
  })

  test('goes live with wrangler deploy when the Worker has no version to stage beside yet', async () => {
    const plan = {
      'versions upload': {
        status: 1,
        events: [
          {
            type: 'command-failed',
            version: 1,
            message: 'You cannot upload a new version of a Worker that does not yet exist. Please run the `deploy` command first.',
          },
        ],
      },
      deploy: { events: [] },
    }
    const calls = await withWrangler(plan, async (wrangler) => {
      expect(await deployStaged(quick)).toBeUndefined()
      return wrangler.calls()
    })

    expect(calls.at(-1)).toEqual(['deploy', '--message', 'bun run deploy'])
  })

  test('stops, with the live version unchanged, when the upload fails', async () => {
    const plan = { 'versions upload': { status: 1, events: [{ type: 'command-failed', version: 1, message: 'Authentication error' }] } }
    const problem = await withWrangler(plan, () => deployStaged(quick))

    expect(problem).toBe('Could not upload the new version; wrangler says why above. The live version is unchanged.')
  })

  test("says the new version is live but its triggers aren't when triggers deploy fails", async () => {
    const version = versionAt(200)
    try {
      const plan = { 'versions upload': uploaded(version.url), 'triggers deploy': { status: 1 } }
      const problem = await withWrangler(plan, () => deployStaged(quick))

      expect(problem).toContain('The new version 1a2b3c4d is live, but Cloudflare didn\'t take the cron schedule')
      expect(problem).toContain('Run bun run deploy again')
    } finally {
      version.stop()
    }
  })
})
