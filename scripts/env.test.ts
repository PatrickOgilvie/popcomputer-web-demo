import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Schema as S } from 'effect'
import { defineEnv, randomSecret, secret, variable } from '@popcomputer/web/env'

import { env } from '../src/env'
import {
  checkLocal,
  checkRemote,
  readDevVars,
  readSecretNames,
  readWranglerVars,
  secretNameProblem,
  secretValueProblem,
} from './env'

// An app that has added a mail service's key to the template's declaration.
const mailing = defineEnv({
  BETTER_AUTH_SECRET: secret(S.String.check(S.isMinLength(32)), { generate: randomSecret }),
  RESEND_API_KEY: secret(S.String.check(S.isStartingWith('re_'))),
  SENTRY_DSN: secret(S.String, { optional: true }),
  ENVIRONMENT: variable(S.Literals(['development', 'production', 'test'])),
})

const authSecret = 'a-secret-of-thirty-two-characters-or-more'
const production = { ENVIRONMENT: 'production' }

describe("the template's declaration", () => {
  test('generates the secret Better Auth signs sessions with, and needs ENVIRONMENT', () => {
    expect(env.entries.BETTER_AUTH_SECRET.generate).toBe(randomSecret)
    expect(env.entries.ENVIRONMENT).toMatchObject({ kind: 'variable', optional: false })
  })

  test("names every secret in .dev.vars.example, where the Deploy to Cloudflare button asks for them", () => {
    const example = readDevVars('.dev.vars.example')
    const secrets = Object.entries(env.entries).filter(([, entry]) => entry.kind === 'secret')

    expect(secrets.map(([name]) => name).filter((name) => !Object.hasOwn(example, name))).toEqual([])
  })

  test("sets its vars in wrangler.jsonc, as a deploy needs them", () => {
    expect(checkRemote(env, readWranglerVars(readFileSync('wrangler.jsonc', 'utf8')), new Set(['BETTER_AUTH_SECRET']))).toEqual({
      problems: [],
      generated: [],
    })
  })
})

describe('the files', () => {
  test("reads wrangler.jsonc's vars past its comments", () => {
    const config = `{
  // The app's name.
  "name": "book-club",
  "vars": { "ENVIRONMENT": "production", "TIME_ZONE": "Europe/London" }, // trailing comma next
}`

    expect(readWranglerVars(config)).toEqual({ ENVIRONMENT: 'production', TIME_ZONE: 'Europe/London' })
    expect(readWranglerVars('{ "name": "book-club" }')).toEqual({})
  })

  test('reads .dev.vars as wrangler does, and none when there is no file', () => {
    const folder = mkdtempSync(join(tmpdir(), 'dev-vars-'))
    const path = join(folder, '.dev.vars')
    writeFileSync(path, '# mine\nBETTER_AUTH_SECRET=abc+/=\nexport RESEND_API_KEY="re_123 # not a comment"\n')

    expect(readDevVars(path)).toEqual({ BETTER_AUTH_SECRET: 'abc+/=', RESEND_API_KEY: 're_123 # not a comment' })
    expect(readDevVars(join(folder, 'missing'))).toEqual({})
  })
})

describe('local check', () => {
  test('passes when .dev.vars and the vars hold everything', () => {
    const devVars = { BETTER_AUTH_SECRET: authSecret, RESEND_API_KEY: 're_123' }

    expect(checkLocal(mailing, production, devVars)).toEqual({ problems: [], generated: [] })
  })

  test('leaves a missing secret it can generate to bun run dev, and says where to put one it cannot', () => {
    expect(checkLocal(mailing, production, {})).toEqual({
      problems: ['The secret RESEND_API_KEY is missing from .dev.vars. Add a line RESEND_API_KEY=its value there.'],
      generated: ['BETTER_AUTH_SECRET'],
    })
  })

  test("reads the example's placeholder as missing", () => {
    const devVars = { BETTER_AUTH_SECRET: authSecret, RESEND_API_KEY: 'replace-me-with-your-resend-key' }

    expect(checkLocal(mailing, production, devVars).problems).toEqual([
      "The secret RESEND_API_KEY in .dev.vars still holds the example's placeholder. Put its value there instead.",
    ])
  })

  test('says which file holds an invalid value, and never the value', () => {
    const devVars = { BETTER_AUTH_SECRET: 'short-and-guessable', RESEND_API_KEY: 're_123' }
    const { problems } = checkLocal(mailing, { ENVIRONMENT: 'staging' }, devVars)

    expect(problems).toEqual([
      'The secret BETTER_AUTH_SECRET is invalid: Expected a value with a length of at least 32. Change it in .dev.vars.',
      `The variable ENVIRONMENT is invalid: Expected "development" | "production" | "test". Change it in wrangler.jsonc's vars.`,
    ])
    expect(problems.join('\n')).not.toContain('short-and-guessable')
  })

  test('takes .dev.vars over the vars, as the development server does', () => {
    const devVars = { BETTER_AUTH_SECRET: authSecret, RESEND_API_KEY: 're_123', ENVIRONMENT: 'development' }

    expect(checkLocal(mailing, { ENVIRONMENT: 'staging' }, devVars).problems).toEqual([])
  })

  test('says where a missing var goes', () => {
    expect(checkLocal(mailing, {}, { BETTER_AUTH_SECRET: authSecret, RESEND_API_KEY: 're_123' }).problems).toEqual([
      'The variable ENVIRONMENT is missing. Set it in vars in wrangler.jsonc, or in .dev.vars for this computer only.',
    ])
  })

  test('refuses a secret in the vars wrangler.jsonc commits', () => {
    const vars = { ...production, RESEND_API_KEY: 're_123' }

    expect(checkLocal(mailing, vars, { BETTER_AUTH_SECRET: authSecret }).problems).toEqual([
      "RESEND_API_KEY is a secret, but wrangler.jsonc sets it in vars, where it's committed with the code. Remove it from vars, put it in .dev.vars, and set it on Cloudflare with bun run secret RESEND_API_KEY.",
    ])
  })
})

describe('remote check', () => {
  test('passes when Cloudflare has every required secret', () => {
    expect(checkRemote(mailing, production, new Set(['BETTER_AUTH_SECRET', 'RESEND_API_KEY']))).toEqual({
      problems: [],
      generated: [],
    })
  })

  test('leaves a missing secret it can generate to the deploy, and names the command for one it cannot', () => {
    expect(checkRemote(mailing, production, new Set())).toEqual({
      problems: ["The secret RESEND_API_KEY isn't set on Cloudflare. Run bun run secret RESEND_API_KEY to set it."],
      generated: ['BETTER_AUTH_SECRET'],
    })
  })

  test("checks the vars a deploy takes from wrangler.jsonc", () => {
    const uploaded = new Set(['BETTER_AUTH_SECRET', 'RESEND_API_KEY'])

    expect(checkRemote(mailing, {}, uploaded).problems).toEqual([
      "The variable ENVIRONMENT isn't in wrangler.jsonc's vars. Add it there.",
    ])
    expect(checkRemote(mailing, { ENVIRONMENT: 'staging' }, uploaded).problems).toEqual([
      `The variable ENVIRONMENT is invalid: Expected "development" | "production" | "test". Change it in wrangler.jsonc's vars.`,
    ])
  })
})

describe('secret list', () => {
  const listed = (stdout: string) => ({ status: 0, stdout, stderr: '' })

  test('reads the names wrangler secret list shows', () => {
    const stdout = JSON.stringify(
      [
        { name: 'BETTER_AUTH_SECRET', type: 'secret_text' },
        { name: 'RESEND_API_KEY', type: 'secret_text' },
      ],
      null,
      '  '
    )

    expect(readSecretNames(listed(stdout))).toEqual(new Set(['BETTER_AUTH_SECRET', 'RESEND_API_KEY']))
    expect(readSecretNames(listed('[]'))).toEqual(new Set())
  })

  test("reads no Worker before the first deploy, when there's none to hold them yet", () => {
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

    expect(readSecretNames(notFound)).toBe('no-worker')
  })

  test('reads nothing when wrangler failed some other way', () => {
    const failed = { status: 1, stdout: '', stderr: '✘ [ERROR] A request to the Cloudflare API failed.' }

    expect(readSecretNames(failed)).toBeUndefined()
    expect(readSecretNames(listed('not json'))).toBeUndefined()
  })
})

describe('bun run secret', () => {
  test('sets only a secret src/env.ts declares', () => {
    expect(secretNameProblem(mailing, 'RESEND_API_KEY')).toBeUndefined()
    expect(secretNameProblem(mailing, undefined)).toBe(
      'Name the secret to set: bun run secret NAME. src/env.ts declares BETTER_AUTH_SECRET, RESEND_API_KEY, SENTRY_DSN.'
    )
    expect(secretNameProblem(mailing, 'STRIPE_KEY')).toBe(
      'src/env.ts declares no STRIPE_KEY. Declare it there with secret(...) first; its secrets are BETTER_AUTH_SECRET, RESEND_API_KEY, SENTRY_DSN.'
    )
    expect(secretNameProblem(mailing, 'ENVIRONMENT')).toBe(
      'ENVIRONMENT is a variable, not a secret: set it in vars in wrangler.jsonc.'
    )
  })

  test('uploads only a value its schema accepts, and never repeats it', () => {
    expect(secretValueProblem(mailing, 'RESEND_API_KEY', 're_123')).toBeUndefined()
    expect(secretValueProblem(mailing, 'RESEND_API_KEY', 'sk_live_123')).toBe(
      'The secret RESEND_API_KEY is invalid: Expected a string starting with "re_".'
    )
    expect(secretValueProblem(mailing, 'RESEND_API_KEY', '')).toBe('The value for RESEND_API_KEY is empty.')
    expect(secretValueProblem(mailing, 'SENTRY_DSN', '')).toBe('The value for SENTRY_DSN is empty.')
  })
})
