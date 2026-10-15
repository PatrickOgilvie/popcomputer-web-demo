import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { InvalidDevOrigin, readViteDevServerConfiguration } from './dev-environment'
import {
  countAppliedMigrations,
  createDevCommands,
  createOutputFilter,
  createDevServerEnvironment,
  createDevVars,
  ensureDevVars,
  InvalidPortlessPort,
  nodeProblem,
  type PortlessProcessEnvironment,
  readDevSession,
} from './dev'

// A sample app, so the tests pass whatever name bun create gave this one.
const SAMPLE_VITE_ROUTE = 'vite.sample-app'
const readSampleSession = (environment: PortlessProcessEnvironment, resolveUrl?: (routeName: string) => string) =>
  readDevSession(environment, resolveUrl, SAMPLE_VITE_ROUTE)

const resolveHttpsVite = (routeName: string) => `https://${routeName}.localhost`

describe('development session', () => {
  test('pairs the portless Worker route with its sibling Vite route', () => {
    const resolved: Array<string> = []
    const session = readSampleSession(
      {
        PORT: '4123',
        PORTLESS_URL: 'https://sample-app.localhost',
      },
      (routeName) => {
        resolved.push(routeName)
        return resolveHttpsVite(routeName)
      }
    )

    expect(resolved).toEqual([SAMPLE_VITE_ROUTE])
    expect(session.mode).toBe('portless')
    expect(session.workerPort).toBe(4123)
    expect(session.workerOrigin.origin).toBe(
      'https://sample-app.localhost'
    )
    expect(session.viteOrigin.origin).toBe(
      'https://vite.sample-app.localhost'
    )
  })

  test('keeps worktree prefixes and explicit proxy ports from portless', () => {
    const session = readSampleSession(
      {
        PORT: '4999',
        PORTLESS_URL: 'http://fix-ui.sample-app.localhost:1355',
      },
      () => 'http://fix-ui.vite.sample-app.localhost:1355'
    )

    expect(createDevServerEnvironment(session)).toEqual({
      DEV_VITE_ORIGIN: 'http://fix-ui.vite.sample-app.localhost:1355',
      DEV_WORKER_ORIGIN: 'http://fix-ui.sample-app.localhost:1355',
    })
  })

  test('falls back to one fixed loopback pair when portless is bypassed', () => {
    const session = readSampleSession({}, () => {
      throw new Error('portless must not be consulted in direct mode')
    })

    expect(session.mode).toBe('direct')
    expect(createDevServerEnvironment(session)).toEqual({
      DEV_VITE_ORIGIN: 'http://localhost:5173',
      DEV_WORKER_ORIGIN: 'http://localhost:8787',
    })
  })

  test.each(['0', '65536', '4123.5', '04123', undefined])(
    'rejects an invalid portless PORT %p',
    (PORT) => {
      expect(() =>
        readSampleSession(
          { PORT, PORTLESS_URL: 'https://sample-app.localhost' },
          resolveHttpsVite
        )
      ).toThrow(InvalidPortlessPort)
    }
  )

  test.each([
    'https://example.com',
    'https://sample-app.localhost/',
    'https://sample-app.localhost/path',
    'https://user:pass@sample-app.localhost',
    'ftp://sample-app.localhost',
  ])('rejects a non-local or non-exact route origin %p', (PORTLESS_URL) => {
    expect(() =>
      readSampleSession({ PORT: '4123', PORTLESS_URL }, resolveHttpsVite)
    ).toThrow(InvalidDevOrigin)
  })
})

describe('development commands', () => {
  test('runs Vite as a portless route and Wrangler at the public origin', () => {
    const session = readSampleSession(
      {
        PORT: '4123',
        PORTLESS_URL: 'https://sample-app.localhost',
      },
      resolveHttpsVite
    )

    expect(createDevCommands(session)).toEqual([
      {
        name: 'vite',
        command: 'portless run --name vite.sample-app vite',
      },
      {
        name: 'worker',
        command:
          'wrangler dev --port 4123 --ip 127.0.0.1 --local-upstream sample-app.localhost --upstream-protocol https --var ENVIRONMENT:development --var DEV_VITE_ORIGIN:https://vite.sample-app.localhost',
      },
    ])
  })

  test('pins strict default ports when portless is bypassed', () => {
    const [vite, worker] = createDevCommands(readSampleSession({}))

    expect(vite?.command).toBe('vite --port 5173 --strictPort')
    expect(worker?.command).toContain('--port 8787')
    expect(worker?.command).toContain('--local-upstream localhost:8787')
    expect(worker?.command).toContain('--upstream-protocol http ')
  })
})

describe('Vite development policy', () => {
  test('restricts CORS to the exact paired Worker origin', () => {
    expect(
      readViteDevServerConfiguration({
        DEV_VITE_ORIGIN: 'https://vite.sample-app.localhost',
        DEV_WORKER_ORIGIN: 'https://sample-app.localhost',
      })
    ).toEqual({
      viteOrigin: 'https://vite.sample-app.localhost',
      workerOrigin: 'https://sample-app.localhost',
    })

    expect(() =>
      readViteDevServerConfiguration({
        DEV_VITE_ORIGIN: 'https://vite.sample-app.localhost',
        DEV_WORKER_ORIGIN: 'https://example.com',
      })
    ).toThrow('DEV_WORKER_ORIGIN must be an exact local HTTP(S) origin.')
  })

  test('applies no dev-server policy to standalone Vite commands', () => {
    expect(readViteDevServerConfiguration({})).toBeUndefined()
  })

  test('requires both origins once either is supplied', () => {
    expect(() =>
      readViteDevServerConfiguration({
        DEV_VITE_ORIGIN: 'https://vite.sample-app.localhost',
      })
    ).toThrow('DEV_WORKER_ORIGIN must be an exact local HTTP(S) origin.')
  })
})

describe('first run', () => {
  test('writes .dev.vars with a fresh secret, readable only by its owner', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dev-vars-')), '.dev.vars')

    expect(ensureDevVars(path)).toBe('written')
    const secret = /^BETTER_AUTH_SECRET=(.+)$/m.exec(readFileSync(path, 'utf8'))?.[1]
    expect(Buffer.from(secret ?? '', 'base64')).toHaveLength(32)
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })

  test('keeps an existing .dev.vars', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dev-vars-')), '.dev.vars')
    writeFileSync(path, createDevVars('mine'))

    expect(ensureDevVars(path)).toBe('kept')
    expect(readFileSync(path, 'utf8')).toContain('BETTER_AUTH_SECRET=mine')
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
    writeFileSync(path, '# copied\nBETTER_AUTH_SECRET=replace-me-with-the-output-of-openssl-rand-base64-32\n')

    expect(ensureDevVars(path)).toBe('replaced')
    const vars = readFileSync(path, 'utf8')
    expect(vars).toStartWith('# copied\n')
    expect(vars).not.toContain('replace-me')
  })
})

describe('local migrations', () => {
  test("counts the migrations wrangler's table marks applied", () => {
    expect(countAppliedMigrations('│ 0000_initial.sql │ ✅     │\n│ 0001_links.sql │ ✅     │')).toBe(2)
    expect(countAppliedMigrations('✅ No migrations to apply!'.replace('✅ ', ''))).toBe(0)
  })
})

describe('server output', () => {
  const app = 'https://reading-list.localhost'

  test("drops wrangler's notice that crons don't run locally", () => {
    const filter = createOutputFilter(app, () => false)
    const shown = [
      '[worker] ▲ [WARNING] Scheduled Workers are not automatically triggered during local development.',
      '[worker] ',
      '[worker]   To manually trigger a scheduled event, run:',
      '[worker]     curl "http://127.0.0.1:4115/cdn-cgi/local/scheduled"',
      '[worker]   For more details, see https://developers.cloudflare.com/workers/configuration/cron-triggers/#test-cron-triggers-locally',
      '[worker] Ready on http://127.0.0.1:4115',
    ].flatMap(filter)

    expect(shown).toEqual(['[worker] Ready on http://127.0.0.1:4115', `Open ${app} in your browser.`])
  })

  test('never hides more than the notice, whatever its wording', () => {
    const filter = createOutputFilter(app, () => false)
    filter('[worker] ▲ [WARNING] Scheduled Workers are not automatically triggered during local development.')
    const later = Array.from({ length: 10 }, (_, line) => `[worker] line ${line}`).flatMap(filter)

    expect(later).toHaveLength(4)
  })

  test("drops the servers' exit codes only after Ctrl-C", () => {
    let stopping = false
    const filter = createOutputFilter(app, () => stopping)
    const exited = '[vite] portless run --name vite.reading-list vite exited with code 130'

    expect(filter(exited)).toEqual([exited])
    stopping = true
    expect(filter(exited)).toEqual([])
    expect(filter('--> Sending SIGTERM to other processes..')).toEqual([])
  })
})
