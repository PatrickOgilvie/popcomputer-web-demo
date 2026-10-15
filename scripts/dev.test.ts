import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { InvalidDevOrigin, readViteDevServerConfiguration } from './dev-environment'
import {
  createDevCommands,
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

    expect(ensureDevVars(path)).toBe(true)
    const secret = /^BETTER_AUTH_SECRET=(.+)$/m.exec(readFileSync(path, 'utf8'))?.[1]
    expect(Buffer.from(secret ?? '', 'base64')).toHaveLength(32)
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })

  test('keeps an existing .dev.vars', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dev-vars-')), '.dev.vars')
    writeFileSync(path, createDevVars('mine'))

    expect(ensureDevVars(path)).toBe(false)
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
