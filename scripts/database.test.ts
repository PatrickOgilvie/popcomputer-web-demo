import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'

import { readSeed, readsOnly, shellQuote, splitStatements } from './database'

describe('SQL statements', () => {
  test('splits at each semicolon outside quotes and comments', () => {
    expect(splitStatements('SELECT 1; SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2'])
    expect(splitStatements("SELECT ';' AS semicolon; -- a comment; still\nSELECT \"a;b\" FROM [x;y]")).toEqual([
      "SELECT ';' AS semicolon",
      '-- a comment; still\nSELECT "a;b" FROM [x;y]',
    ])
    expect(splitStatements("SELECT 'it''s; fine'")).toEqual(["SELECT 'it''s; fine'"])
  })

  test('drops what is only space or comments', () => {
    expect(splitStatements('  ;  -- nothing here\n /* nor here; */ ;')).toEqual([])
  })

  test('reads SELECT, EXPLAIN, a WITH that only selects and a PRAGMA that sets nothing as reads', () => {
    expect(readsOnly('SELECT * FROM projects')).toBe(true)
    expect(readsOnly('  -- the newest first\n  select name from projects order by created_at desc')).toBe(true)
    expect(readsOnly("EXPLAIN QUERY PLAN SELECT * FROM projects WHERE user_id = 'x'")).toBe(true)
    expect(readsOnly('WITH recent AS (SELECT * FROM projects) SELECT count(*) FROM recent')).toBe(true)
    expect(readsOnly('PRAGMA table_info(projects)')).toBe(true)
    expect(readsOnly("SELECT 'DELETE FROM projects' AS text")).toBe(true)
  })

  test('counts everything else as a write, to ask about first', () => {
    expect(readsOnly("UPDATE projects SET visibility = 'public'")).toBe(false)
    expect(readsOnly('DELETE FROM projects')).toBe(false)
    expect(readsOnly("INSERT INTO projects (id) VALUES ('x')")).toBe(false)
    expect(readsOnly('WITH old AS (SELECT id FROM projects) DELETE FROM projects WHERE id IN old')).toBe(false)
    expect(readsOnly('DROP TABLE projects')).toBe(false)
    expect(readsOnly('PRAGMA foreign_keys = OFF')).toBe(false)
    expect(readsOnly('VACUUM')).toBe(false)
  })

  test('quotes a statement so a shell passes it as shown', () => {
    expect(shellQuote("DELETE FROM projects WHERE name = 'Apollo'")).toBe(
      `'DELETE FROM projects WHERE name = '\\''Apollo'\\'''`
    )
    const echoed = spawnSync('sh', ['-c', `printf %s ${shellQuote("it's $HOME `x`")}`], { encoding: 'utf8' })
    expect(echoed.stdout).toBe("it's $HOME `x`")
  })
})

describe('seed', () => {
  test('reads the seed function a module exports, by name or as its default', () => {
    const seed = async () => {}

    expect(readSeed({ seed })).toBe(seed)
    expect(readSeed({ default: seed })).toBe(seed)
    expect(readSeed({ projects: [] })).toBeUndefined()
  })

  test("the template's seed exports one", async () => {
    expect(readSeed(await import('../src/seed'))).toBeFunction()
  })
})

describe('without a terminal', () => {
  const run = (...args: ReadonlyArray<string>) =>
    spawnSync('bun', ['scripts/database.ts', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

  test("db:reset asks for --yes rather than deleting the local database's data unasked", () => {
    const result = run('reset')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('bun run db:reset')
  })

  test('db:execute says to quote SQL the shell would split', () => {
    const result = run('execute', 'SELECT', '*', 'FROM', 'projects')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Put the SQL in quotes')
  })

  test('db:execute runs one statement at a time', () => {
    const result = run('execute', 'SELECT 1; DELETE FROM projects')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('runs one statement at a time, and that has 2')
  })

  test('names its commands when given another', () => {
    expect(run('drop').stderr).toContain('runs reset, seed or execute')
  })
})
