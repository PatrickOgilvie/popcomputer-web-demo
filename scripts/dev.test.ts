import { describe, expect, test } from 'bun:test'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Schema as S } from 'effect'
import { defineEnv, randomSecret, secret, variable } from '@popcomputer/web/env'

import { env } from '../src/env'

import {
  countAppliedMigrations,
  describeLocalMigrations,
  createOutputFilter,
  createViteArguments,
  devVarsProblem,
  DIRECT_PORT,
  ensureDevVars,
  InvalidPortlessPort,
  InvalidPortlessUrl,
  nodeProblem,
  processTree,
  readDevSession,
  readRunningDev,
} from './dev'

describe('development session', () => {
  test('serves the app at the address portless gave it, on its port', () => {
    const session = readDevSession({ PORT: '4123', PORTLESS_URL: 'https://reading-list.localhost' })

    expect(session).toEqual({ mode: 'portless', port: 4123, appOrigin: 'https://reading-list.localhost' })
    expect(createViteArguments(session)).toEqual(['--port', '4123', '--strictPort', '--host', '127.0.0.1'])
  })

  test('keeps worktree prefixes and explicit proxy ports from portless', () => {
    const session = readDevSession({ PORT: '4999', PORTLESS_URL: 'http://fix-ui.reading-list.localhost:1355' })

    expect(session.appOrigin).toBe('http://fix-ui.reading-list.localhost:1355')
  })

  test('falls back to one fixed port when portless is bypassed', () => {
    const session = readDevSession({})

    expect(session).toEqual({ mode: 'direct', port: DIRECT_PORT, appOrigin: `http://localhost:${DIRECT_PORT}` })
    expect(createViteArguments(session)).toEqual(['--port', String(DIRECT_PORT), '--strictPort'])
  })

  test.each(['0', '65536', '4123.5', '04123', undefined])('rejects an invalid portless PORT %p', (PORT) => {
    expect(() => readDevSession({ PORT, PORTLESS_URL: 'https://reading-list.localhost' })).toThrow(
      InvalidPortlessPort
    )
  })

  test.each(['not a url', 'ftp://reading-list.localhost'])('rejects a portless address %p', (PORTLESS_URL) => {
    expect(() => readDevSession({ PORT: '4123', PORTLESS_URL })).toThrow(InvalidPortlessUrl)
  })
})

describe('first run', () => {
  const devVarsPath = () => join(mkdtempSync(join(tmpdir(), 'dev-vars-')), '.dev.vars')

  test('writes .dev.vars with each secret src/env.ts generates, readable only by its owner', () => {
    const path = devVarsPath()

    expect(ensureDevVars(undefined, path)).toEqual({ file: 'written', names: ['BETTER_AUTH_SECRET'] })
    const secret = /^BETTER_AUTH_SECRET=(.+)$/m.exec(readFileSync(path, 'utf8'))?.[1]
    expect(Buffer.from(secret ?? '', 'base64')).toHaveLength(32)
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })

  test('keeps an existing .dev.vars and its values', () => {
    const path = devVarsPath()
    writeFileSync(path, 'BETTER_AUTH_SECRET=mine\n')

    expect(ensureDevVars(undefined, path)).toEqual({ file: 'kept', names: [] })
    expect(readFileSync(path, 'utf8')).toBe('BETTER_AUTH_SECRET=mine\n')
  })

  test('adds a secret src/env.ts has come to generate, and leaves the rest to whoever sets it', () => {
    const path = devVarsPath()
    writeFileSync(path, '# mine\nBETTER_AUTH_SECRET=mine')
    const declaration = defineEnv({
      BETTER_AUTH_SECRET: secret(S.String, { generate: randomSecret }),
      COOKIE_SECRET: secret(S.String, { generate: () => 'a value with spaces' }),
      RESEND_API_KEY: secret(S.String),
      ENVIRONMENT: variable(),
    })

    expect(ensureDevVars(declaration, path)).toEqual({ file: 'updated', names: ['COOKIE_SECRET'] })
    expect(readFileSync(path, 'utf8')).toBe('# mine\nBETTER_AUTH_SECRET=mine\nCOOKIE_SECRET="a value with spaces"\n')
  })
})

describe("the Worker's vars and secrets", () => {
  test("starts with the template's .dev.vars", () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dev-vars-')), '.dev.vars')
    ensureDevVars(undefined, path)

    expect(devVarsProblem(undefined, path)).toBeUndefined()
  })

  test('stops, naming what to add, when a secret nobody generates is missing', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dev-vars-')), '.dev.vars')
    writeFileSync(path, 'BETTER_AUTH_SECRET=a-secret-of-thirty-two-characters-or-more\n')
    const declaration = defineEnv({ ...env.entries, RESEND_API_KEY: secret(S.String) })

    expect(devVarsProblem(declaration, path)).toBe(
      [
        "The app can't start without what src/env.ts says it needs:",
        '- The secret RESEND_API_KEY is missing from .dev.vars. Add a line RESEND_API_KEY=its value there.',
        'Then run bun run dev again.',
      ].join('\n')
    )
  })
})

describe('Node.js for wrangler', () => {
  test('accepts Node.js 22 or later', () => {
    expect(nodeProblem('22.12.0')).toBeUndefined()
    expect(nodeProblem('24.11.1')).toBeUndefined()
  })

  test("stops with directions when there's only Bun's stand-in or no Node.js", () => {
    expect(nodeProblem('bun')).toBe(
      'Wrangler needs Node.js 22 or later, and this computer has none. Install the LTS from https://nodejs.org, then run bun run dev again.'
    )
    expect(nodeProblem(undefined)).toContain('this computer has none')
  })

  test('names an older Node.js', () => {
    expect(nodeProblem('20.5.1')).toContain('this computer has 20.5.1')
  })
})

describe('first run, copied example', () => {
  test("replaces the example's placeholder secret", () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dev-vars-')), '.dev.vars')
    writeFileSync(path, `# copied\n${readFileSync('.dev.vars.example', 'utf8')}`)

    expect(ensureDevVars(undefined, path)).toEqual({ file: 'updated', names: ['BETTER_AUTH_SECRET'] })
    const vars = readFileSync(path, 'utf8')
    expect(vars).toStartWith('# copied\n')
    expect(vars).not.toContain('replace-me')
  })
})

describe('local migrations', () => {
  // wrangler's output, word for word, after applying one migration and with none to apply.
  const applied = [
    'Migrations to be applied:',
    '┌──────────────────┐',
    '│ name             │',
    '├──────────────────┤',
    '│ 0000_initial.sql │',
    '└──────────────────┘',
    '🚣 14 commands executed successfully.',
    '┌──────────────────┬────────┐',
    '│ name             │ status │',
    '├──────────────────┼────────┤',
    '│ 0000_initial.sql │ ✅     │',
    '└──────────────────┴────────┘',
  ].join('\n')
  const upToDate = [' ⛅️ wrangler 4.151.0', '────────────────────', 'Resource location: local ', '✅ No migrations to apply!'].join('\n')

  test("counts the migrations wrangler's status table marks applied", () => {
    expect(countAppliedMigrations(applied)).toBe(1)
    expect(countAppliedMigrations(`${applied}\n│ 0001_links.sql   │ ✅     │`)).toBe(2)
  })

  test('counts none when there was nothing to apply', () => {
    expect(countAppliedMigrations(upToDate)).toBe(0)
  })

  test('says the local database is up to date when nothing was applied', () => {
    expect(describeLocalMigrations(0)).toBe('The local database is up to date.')
    expect(describeLocalMigrations(1)).toBe('Applied 1 migration to the local database.')
    expect(describeLocalMigrations(2)).toBe('Applied 2 migrations to the local database.')
  })
})

describe('server output', () => {
  const app = 'https://reading-list.localhost'

  test("names one address: Vite's loopback lines go, and it says where to open the app", () => {
    const filter = createOutputFilter(app)
    const shown = [
      '',
      '  VITE v6.4.4  ready in 2230 ms',
      '',
      '  ➜  Local:   http://127.0.0.1:4720/',
      '  ➜  Debug:   http://127.0.0.1:4720/__debug',
    ].flatMap(filter)

    expect(shown).toEqual(['', '  VITE v6.4.4  ready in 2230 ms', `  Open ${app} in your browser.`, ''])
  })

  test("drops Node's punycode deprecation notice", () => {
    const filter = createOutputFilter(app)
    const shown = [
      '(node:31064) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.',
      '(Use `node --trace-deprecation ...` to show where the warning was created)',
      'Using secrets defined in .dev.vars',
    ].flatMap(filter)

    expect(shown).toEqual(['Using secrets defined in .dev.vars'])
  })

  test("drops the notice that the debugger's usual port is taken", () => {
    const filter = createOutputFilter(app)
    const shown = [
      'Default inspector port 9229 not available, using 9230 instead',
      '',
      '  VITE v6.4.4  ready in 2230 ms',
    ].flatMap(filter)

    expect(shown).toEqual(['  VITE v6.4.4  ready in 2230 ms', `  Open ${app} in your browser.`])
  })

  test("shortens the plugin's routes for AI agents to the Local Explorer at the app's address", () => {
    const filter = createOutputFilter(app)
    const shown = [
      'The Cloudflare Vite plugin detected this dev session is running in an AI agent.',
      'The Local Explorer API is available at http://127.0.0.1:4720/cdn-cgi/local/explorer/api',
      'Useful routes:',
      '  GET http://127.0.0.1:4720/cdn-cgi/local/explorer/api/d1/database - D1 databases',
      "If the routes above don't cover what you need, fetch the full OpenAPI schema (large - use only as a last resort):",
      '  GET http://127.0.0.1:4720/cdn-cgi/local/explorer/api - OpenAPI schema',
      '9:04:28 AM [vite] (client) hmr update /src/pages/Auth/Login.tsx',
    ].flatMap(filter)

    expect(shown).toEqual([
      `Local Explorer, to look at the local database, KV and traces: ${app}/cdn-cgi/local/explorer (its API: ${app}/cdn-cgi/local/explorer/api)`,
      '9:04:28 AM [vite] (client) hmr update /src/pages/Auth/Login.tsx',
    ])
  })

  test('never hides more than the agents\' list, whatever its wording', () => {
    const filter = createOutputFilter(app)
    filter('The Cloudflare Vite plugin detected this dev session is running in an AI agent.')
    const later = Array.from({ length: 30 }, (_, line) => `line ${line}`).flatMap(filter)

    expect(later).toHaveLength(10)
  })

  test('reads lines through colour codes', () => {
    const filter = createOutputFilter(app)

    expect(filter('  \x1b[32m➜\x1b[39m  \x1b[1mLocal\x1b[22m:   http://127.0.0.1:4720/')).toEqual([])
  })
})

describe('bun run stop', () => {
  test("finds no server when the file is missing, isn't a process id, or names another program", () => {
    const folder = mkdtempSync(join(tmpdir(), 'dev-pid-'))
    const path = join(folder, 'dev.pid')
    expect(readRunningDev(path)).toBeUndefined()

    writeFileSync(path, 'not a process\n')
    expect(readRunningDev(path)).toBeUndefined()

    writeFileSync(path, `${process.pid}\n`)
    expect(readRunningDev(path)).toBeUndefined()
  })

  test('interrupts the processes the server started, as well as the server', async () => {
    const shell = spawn('sh', ['-c', 'sleep 30 & wait'], { stdio: 'ignore' })
    const pid = shell.pid ?? 0
    try {
      let tree = processTree(pid)
      for (let tries = 0; tree.length < 2 && tries < 50; tries += 1) {
        await Bun.sleep(20)
        tree = processTree(pid)
      }

      expect(tree[0]).toBe(pid)
      expect(tree).toHaveLength(2)
    } finally {
      for (const each of [...processTree(pid)].reverse()) process.kill(each, 'SIGKILL')
    }
  })
})
