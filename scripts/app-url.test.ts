import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  appUrlProblem,
  readAccountId,
  readAppUrl,
  readAuthHeaders,
  readSubdomain,
  readWorkerName,
  writeAppUrl,
} from './app-url'
import { fakeWrangler } from './fake-wrangler'

const template = readFileSync('wrangler.jsonc', 'utf8')
const config = (vars: string) => `{
  "name": "book-club",
  // Plain vars, committed with the code.
  "vars": ${vars}
}`

describe('wrangler.jsonc', () => {
  test("reads APP_URL from the vars, and none from the template's", () => {
    expect(readAppUrl(config('{ "APP_URL": "https://book-club.example", "ENVIRONMENT": "production" }'))).toBe(
      'https://book-club.example'
    )
    expect(readAppUrl(template)).toBeUndefined()
  })

  test('puts APP_URL first in the vars, keeping the rest of the file', () => {
    const written = writeAppUrl(template, 'https://book-club.ada.workers.dev') ?? ''

    expect(written).toBe(
      template.replace('"vars": {', '"vars": { "APP_URL": "https://book-club.ada.workers.dev",')
    )
    expect(readAppUrl(written)).toBe('https://book-club.ada.workers.dev')
    expect(Bun.JSONC.parse(written)).toMatchObject({ vars: { ENVIRONMENT: 'production' } })
  })

  test('writes into empty vars without a trailing comma, and nothing without vars', () => {
    expect(writeAppUrl(config('{}'), 'https://book-club.example')).toBe(config('{ "APP_URL": "https://book-club.example" }'))
    expect(writeAppUrl('{ "name": "book-club" }', 'https://book-club.example')).toBeUndefined()
  })

  test("reads the Worker's name, not a binding's", () => {
    expect(readWorkerName(template)).toBe('popcomputer-web-demo')
    expect(readWorkerName('{ "main": "src/worker.ts" }')).toBeUndefined()
  })
})

describe('Cloudflare account', () => {
  const whoami = (ids: ReadonlyArray<string>) => () =>
    JSON.stringify({ loggedIn: true, accounts: ids.map((id) => ({ id, name: `${id}'s Account` })) })

  test('takes CLOUDFLARE_ACCOUNT_ID, then account_id, then the only account of the login', () => {
    const withAccount = '{ "name": "book-club", "account_id": "from-config" }'

    expect(readAccountId('from-environment', withAccount, whoami(['from-login']))).toBe('from-environment')
    expect(readAccountId(undefined, withAccount, whoami(['from-login']))).toBe('from-config')
    expect(readAccountId('', template, whoami(['from-login']))).toBe('from-login')
  })

  test('finds none when the login has several accounts, or wrangler printed no report', () => {
    expect(readAccountId(undefined, template, whoami(['one', 'two']))).toBeUndefined()
    expect(readAccountId(undefined, template, () => '')).toBeUndefined()
  })

  test("signs a request with wrangler's token, or its global API key and email", () => {
    expect(readAuthHeaders('{ "type": "oauth", "token": "t0k3n" }')).toEqual({ Authorization: 'Bearer t0k3n' })
    expect(readAuthHeaders('{ "type": "api_token", "token": "t0k3n" }')).toEqual({ Authorization: 'Bearer t0k3n' })
    expect(readAuthHeaders('{ "type": "api_key", "key": "k3y", "email": "ada@example.com" }')).toEqual({
      'X-Auth-Key': 'k3y',
      'X-Auth-Email': 'ada@example.com',
    })
    expect(readAuthHeaders('Not logged in.')).toBeUndefined()
  })

  test("reads the account's subdomain, its absence, or why Cloudflare refused", () => {
    expect(readSubdomain(200, { success: true, result: { subdomain: 'ada' } })).toEqual({ kind: 'found', subdomain: 'ada' })
    expect(readSubdomain(404, { success: false, errors: [{ code: 10007, message: 'not found' }] })).toEqual({ kind: 'none' })
    expect(readSubdomain(403, { success: false, errors: [{ code: 10000, message: 'Authentication error' }] })).toEqual({
      kind: 'failed',
      reason: 'Authentication error',
    })
    expect(readSubdomain(502, undefined)).toEqual({ kind: 'failed', reason: 'Cloudflare answered 502' })
  })
})

describe('bun run deploy', () => {
  let folder = ''
  let path = ''
  const saved = process.env.CLOUDFLARE_ACCOUNT_ID
  const requests: Array<{ readonly url: string; readonly authorization: string | null }> = []
  const answer = (status: number, body: unknown) => {
    const get = (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), authorization: new Headers(init?.headers).get('Authorization') })
      return Promise.resolve(Response.json(body, { status }))
    }
    // SAFETY: the step only calls it as fetch(url, init).
    return get as typeof fetch
  }

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'app-url-'))
    path = join(folder, 'wrangler.jsonc')
    writeFileSync(path, template.replace('"name": "popcomputer-web-demo"', '"name": "book-club"'))
    requests.length = 0
    process.env.CLOUDFLARE_ACCOUNT_ID = '0123456789abcdef0123456789abcdef'
  })

  afterEach(() => {
    if (saved === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID
    else process.env.CLOUDFLARE_ACCOUNT_ID = saved
  })

  test("writes the Worker's workers.dev address as APP_URL, asking Cloudflare with wrangler's login", async () => {
    const wrangler = fakeWrangler({ 'auth token': { stdout: '{ "type": "oauth", "token": "t0k3n" }' } })
    const log = spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      expect(await appUrlProblem('bun run deploy', path, answer(200, { success: true, result: { subdomain: 'ada' } }))).toBeUndefined()
      expect(log.mock.calls.join('\n')).toContain('https://book-club.ada.workers.dev. Commit that change.')
    } finally {
      log.mockRestore()
      wrangler.restore()
    }

    expect(readAppUrl(readFileSync(path, 'utf8'))).toBe('https://book-club.ada.workers.dev')
    expect(requests).toEqual([
      {
        url: 'https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/workers/subdomain',
        authorization: 'Bearer t0k3n',
      },
    ])
  })

  test('keeps an APP_URL wrangler.jsonc already has, asking nothing', async () => {
    writeFileSync(path, config('{ "APP_URL": "https://book-club.example", "ENVIRONMENT": "production" }'))
    const wrangler = fakeWrangler({})
    try {
      expect(await appUrlProblem('bun run deploy', path, answer(500, {}))).toBeUndefined()
      expect(wrangler.calls()).toEqual([])
    } finally {
      wrangler.restore()
    }

    expect(requests).toEqual([])
    expect(readFileSync(path, 'utf8')).toBe(config('{ "APP_URL": "https://book-club.example", "ENVIRONMENT": "production" }'))
  })

  test('says to set APP_URL by hand when the Worker serves routes, not workers.dev', async () => {
    writeFileSync(path, readFileSync(path, 'utf8').replace('"preview_urls": true,', '"preview_urls": true,\n  "workers_dev": false,'))

    expect(await appUrlProblem('bun run deploy', path, answer(500, {}))).toBe(
      'wrangler.jsonc serves the Worker on routes, not at its workers.dev address, so bun run deploy can\'t tell where emailed links should go: add "APP_URL": "https://…", the address the app is served at, to vars in wrangler.jsonc, then run bun run deploy again.'
    )
  })

  test('says where to choose a subdomain when the account has none, and writes nothing', async () => {
    const wrangler = fakeWrangler({ 'auth token': { stdout: '{ "type": "api_token", "token": "t0k3n" }' } })
    const before = readFileSync(path, 'utf8')
    try {
      const problem = await appUrlProblem('bun run deploy', path, answer(404, { success: false, errors: [{ code: 10007 }] }))

      expect(problem).toStartWith(
        'The Cloudflare account has no workers.dev subdomain yet. Choose one at https://dash.cloudflare.com/0123456789abcdef0123456789abcdef/workers/onboarding'
      )
    } finally {
      wrangler.restore()
    }

    expect(readFileSync(path, 'utf8')).toBe(before)
  })

  test("says why when Cloudflare refuses the login, and how to go on without it", async () => {
    const wrangler = fakeWrangler({ 'auth token': { stdout: '{ "type": "api_token", "token": "t0k3n" }' } })
    try {
      const problem = await appUrlProblem(
        'bun run deploy',
        path,
        answer(403, { success: false, errors: [{ code: 10000, message: 'Authentication error' }] })
      )

      expect(problem).toBe(
        'Could not ask Cloudflare for the account\'s workers.dev subdomain (Authentication error). Run bun run deploy again, or add "APP_URL": "https://…", the address the app is served at, to vars in wrangler.jsonc, then run bun run deploy again.'
      )
    } finally {
      wrangler.restore()
    }
  })
})
