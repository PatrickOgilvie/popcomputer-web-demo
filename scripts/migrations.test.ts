import { describe, expect, test } from 'bun:test'

import { describeMigrations, readUnappliedMigrations } from './migrations'

describe('migrations list', () => {
  // `wrangler d1 migrations list DB --local` with migrations still to apply, as it prints them.
  const toApply = (...names: ReadonlyArray<string>) =>
    [
      '',
      ' ⛅️ wrangler 4.151.0',
      '───────────────────',
      'Resource location: local ',
      '',
      'Use --remote if you want to access the remote instance.',
      '',
      'Migrations to be applied:',
      '┌──────────────────────┐',
      '│ Name                 │',
      '├──────────────────────┤',
      ...names.map((name) => `│ ${name.padEnd(20)} │`),
      '└──────────────────────┘',
      '',
    ].join('\n')

  test('reads the migrations still to apply from its table', () => {
    expect(readUnappliedMigrations(toApply('0000_initial.sql', '0001_notes.sql'))).toEqual([
      '0000_initial.sql',
      '0001_notes.sql',
    ])
  })

  test('reads none when the database has them all', () => {
    expect(readUnappliedMigrations('Resource location: remote \n\n✅ No migrations to apply!\n')).toEqual([])
  })

  test('reads neither from anything else', () => {
    expect(readUnappliedMigrations('✘ [ERROR] Authentication error [code: 10000]')).toBeUndefined()
  })

  test('says a database is up to date, or which migrations it lacks and how to apply them', () => {
    const apply = (them: string) => `bun run deploy applies ${them}`

    expect(describeMigrations('Database on Cloudflare (book-club-db)', [], 1, apply)).toBe(
      'Database on Cloudflare (book-club-db): up to date, with all 1 migration applied.'
    )
    expect(describeMigrations('Local database', ['0001_notes.sql'], 2, apply)).toBe(
      'Local database: 1 migration not applied yet (0001_notes.sql); bun run deploy applies it.'
    )
    expect(describeMigrations('Local database', ['0001_notes.sql', '0002_tags.sql'], 3, apply)).toBe(
      'Local database: 2 migrations not applied yet (0001_notes.sql, 0002_tags.sql); bun run deploy applies them.'
    )
  })
})
