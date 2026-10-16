import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import drizzleConfig from '../drizzle.config'
import { findDatabaseId, PLACEHOLDER_DATABASE_ID, readDatabaseId, writeDatabaseId } from './cloudflare-database'
import { AUTH_SECRET, checkSchema, readDeployUrl, readLogin, readSchemaCheck, readSecret } from './deploy'

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

describe('Better Auth secret', () => {
  const listed = (stdout: string) => ({ status: 0, stdout, stderr: '' })

  test('finds the secret wrangler secret list shows', () => {
    const stdout = JSON.stringify([{ name: AUTH_SECRET, type: 'secret_text' }], null, '  ')

    expect(readSecret(listed(stdout), AUTH_SECRET)).toBe('set')
  })

  test('reads it missing from a Worker without it, or with no secrets', () => {
    const stdout = JSON.stringify([{ name: 'RESEND_API_KEY', type: 'secret_text' }], null, '  ')

    expect(readSecret(listed(stdout), AUTH_SECRET)).toBe('missing')
    expect(readSecret(listed('[]'), AUTH_SECRET)).toBe('missing')
  })

  test("reads it missing before the first deploy, when there's no Worker yet", () => {
    const notFound = {
      status: 1,
      stdout: '',
      stderr: [
        '✘ [ERROR] Worker "book-club" not found.',
        '',
        '  If this is a new Worker, run `wrangler deploy` first to create it.',
        "  Otherwise, check that the Worker name is correct and you're logged into the right account.",
      ].join('\n'),
    }

    expect(readSecret(notFound, AUTH_SECRET)).toBe('missing')
  })

  test('reads neither when wrangler failed some other way', () => {
    const failed = { status: 1, stdout: '', stderr: '✘ [ERROR] A request to the Cloudflare API failed.' }

    expect(readSecret(failed, AUTH_SECRET)).toBeUndefined()
    expect(readSecret(listed('not json'), AUTH_SECRET)).toBeUndefined()
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
    const url = readDeployUrl(output(['https://book-club.ada.workers.dev', 'schedule: 0 3 * * *']))

    expect(url).toBe('https://book-club.ada.workers.dev')
  })

  test('reads none when the Worker serves no workers.dev address', () => {
    expect(readDeployUrl(output(['books.example.com (custom domain)', 'schedule: 0 3 * * *']))).toBeUndefined()
    expect(readDeployUrl('')).toBeUndefined()
  })
})
