import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  InvalidDevOrigin,
  readViteDevServerConfiguration,
  VITE_ROUTE_NAME,
} from './dev-environment'
import {
  createDevCommands,
  createDevServerEnvironment,
  createDevVars,
  ensureDevVars,
  InvalidPortlessPort,
  nodeProblem,
  readDevSession,
} from './dev'

const resolveHttpsVite = (routeName: string) => `https://${routeName}.localhost`

describe('development session', () => {
  test('pairs the portless Worker route with its sibling Vite route', () => {
    const resolved: Array<string> = []
    const session = readDevSession(
      {
        PORT: '4123',
        PORTLESS_URL: 'https://popcomputer-web-demo.localhost',
      },
      (routeName) => {
        resolved.push(routeName)
        return resolveHttpsVite(routeName)
      }
    )

    expect(resolved).toEqual([VITE_ROUTE_NAME])
    expect(session.mode).toBe('portless')
    expect(session.workerPort).toBe(4123)
    expect(session.workerOrigin.origin).toBe(
      'https://popcomputer-web-demo.localhost'
    )
    expect(session.viteOrigin.origin).toBe(
      'https://vite.popcomputer-web-demo.localhost'
    )
  })

  test('keeps worktree prefixes and explicit proxy ports from portless', () => {
    const session = readDevSession(
      {
        PORT: '4999',
        PORTLESS_URL: 'http://fix-ui.popcomputer-web-demo.localhost:1355',
      },
      () => 'http://fix-ui.vite.popcomputer-web-demo.localhost:1355'
    )

    expect(createDevServerEnvironment(session)).toEqual({
      DEV_VITE_ORIGIN: 'http://fix-ui.vite.popcomputer-web-demo.localhost:1355',
      DEV_WORKER_ORIGIN: 'http://fix-ui.popcomputer-web-demo.localhost:1355',
    })
  })

  test('falls back to one fixed loopback pair when portless is bypassed', () => {
    const session = readDevSession({}, () => {
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
        readDevSession(
          { PORT, PORTLESS_URL: 'https://popcomputer-web-demo.localhost' },
          resolveHttpsVite
        )
      ).toThrow(InvalidPortlessPort)
    }
  )

  test.each([
    'https://example.com',
    'https://popcomputer-web-demo.localhost/',
    'https://popcomputer-web-demo.localhost/path',
    'https://user:pass@popcomputer-web-demo.localhost',
    'ftp://popcomputer-web-demo.localhost',
  ])('rejects a non-local or non-exact route origin %p', (PORTLESS_URL) => {
    expect(() =>
      readDevSession({ PORT: '4123', PORTLESS_URL }, resolveHttpsVite)
    ).toThrow(InvalidDevOrigin)
  })
})

describe('development commands', () => {
  test('runs Vite as a portless route and Wrangler at the public origin', () => {
    const session = readDevSession(
      {
        PORT: '4123',
        PORTLESS_URL: 'https://popcomputer-web-demo.localhost',
      },
      resolveHttpsVite
    )

    expect(createDevCommands(session)).toEqual([
      {
        name: 'vite',
        command: 'portless run --name vite.popcomputer-web-demo vite',
      },
      {
        name: 'worker',
        command:
          'wrangler dev --port 4123 --ip 127.0.0.1 --local-upstream popcomputer-web-demo.localhost --upstream-protocol https --var ENVIRONMENT:development --var DEV_VITE_ORIGIN:https://vite.popcomputer-web-demo.localhost',
      },
    ])
  })

  test('pins strict default ports when portless is bypassed', () => {
    const [vite, worker] = createDevCommands(readDevSession({}))

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
        DEV_VITE_ORIGIN: 'https://vite.popcomputer-web-demo.localhost',
        DEV_WORKER_ORIGIN: 'https://popcomputer-web-demo.localhost',
      })
    ).toEqual({
      viteOrigin: 'https://vite.popcomputer-web-demo.localhost',
      workerOrigin: 'https://popcomputer-web-demo.localhost',
    })

    expect(() =>
      readViteDevServerConfiguration({
        DEV_VITE_ORIGIN: 'https://vite.popcomputer-web-demo.localhost',
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
        DEV_VITE_ORIGIN: 'https://vite.popcomputer-web-demo.localhost',
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
