import { describe, expect, test } from 'bun:test'
import { Effect, Exit, Redacted } from 'effect'

import { parseRuntimeConfig } from './runtime-config'

const validBindings = {
  ENVIRONMENT: 'production',
  APP_ORIGIN: 'https://example.com',
  BETTER_AUTH_SECRET: 'a-high-entropy-secret-with-32-characters',
  BETTER_AUTH_TRUSTED_ORIGINS:
    ' https://admin.example.com ,https://ops.example.com ',
  DEV_VITE_ORIGIN: 'https://vite.popcomputer-web-demo.localhost',
} as const

describe('runtime configuration', () => {
  test('parses one redacted, canonical request configuration', async () => {
    const config = await Effect.runPromise(parseRuntimeConfig(validBindings))

    expect(config.mode).toBe('production')
    expect(config.appOrigin.origin).toBe('https://example.com')
    expect(config.trustedOrigins.map((origin) => origin.origin)).toEqual([
      'https://admin.example.com',
      'https://ops.example.com',
    ])
    expect(config.viteOrigin.origin).toBe(
      'https://vite.popcomputer-web-demo.localhost'
    )
    expect(Redacted.value(config.authSecret)).toBe(
      validBindings.BETTER_AUTH_SECRET
    )
    expect(String(config.authSecret)).not.toContain(
      validBindings.BETTER_AUTH_SECRET
    )
  })

  test('uses the default Vite origin and no additional origins when absent', async () => {
    const config = await Effect.runPromise(
      parseRuntimeConfig({
        ENVIRONMENT: 'development',
        APP_ORIGIN: 'http://localhost:8787',
        BETTER_AUTH_SECRET: validBindings.BETTER_AUTH_SECRET,
      })
    )

    expect(config.viteOrigin.origin).toBe('http://localhost:5173')
    expect(config.trustedOrigins).toEqual([])
  })

  test('allows an external HTTP origin only outside production', async () => {
    const config = await Effect.runPromise(
      parseRuntimeConfig({
        ...validBindings,
        ENVIRONMENT: 'development',
        APP_ORIGIN: 'http://dev.example.com',
        BETTER_AUTH_TRUSTED_ORIGINS: 'http://admin.dev.example.com',
      })
    )

    expect(config.appOrigin.origin).toBe('http://dev.example.com')
    expect(config.trustedOrigins[0]?.origin).toBe(
      'http://admin.dev.example.com'
    )
  })

  test.each([
    [
      'APP_ORIGIN',
      { ...validBindings, APP_ORIGIN: 'http://example.com' },
    ],
    [
      'BETTER_AUTH_TRUSTED_ORIGINS',
      {
        ...validBindings,
        BETTER_AUTH_TRUSTED_ORIGINS: 'http://admin.example.com',
      },
    ],
    [
      'BETTER_AUTH_TRUSTED_ORIGINS',
      {
        ...validBindings,
        BETTER_AUTH_TRUSTED_ORIGINS: 'http://localhost:8787',
      },
    ],
  ] as const)(
    'requires HTTPS for external production %s',
    async (field, input) => {
      const error = await Effect.runPromise(
        parseRuntimeConfig(input).pipe(Effect.flip)
      )

      expect(error.field).toBe(field)
      expect(error.reason).toBe('https-required-in-production')
      expect(JSON.stringify(error)).not.toContain('example.com')
    }
  )

  test.each([
    ['ENVIRONMENT', { ...validBindings, ENVIRONMENT: 'staging' }],
    ['APP_ORIGIN', { ...validBindings, APP_ORIGIN: 'https://example.com/path' }],
    ['APP_ORIGIN', { ...validBindings, APP_ORIGIN: ' https://example.com' }],
    ['APP_ORIGIN', { ...validBindings, APP_ORIGIN: 'https://*.example.com' }],
    ['BETTER_AUTH_SECRET', { ...validBindings, BETTER_AUTH_SECRET: 'short' }],
    [
      'BETTER_AUTH_TRUSTED_ORIGINS',
      {
        ...validBindings,
        BETTER_AUTH_TRUSTED_ORIGINS: 'https://example.com,',
      },
    ],
    [
      'BETTER_AUTH_TRUSTED_ORIGINS',
      {
        ...validBindings,
        BETTER_AUTH_TRUSTED_ORIGINS: 'https://*.example.com',
      },
    ],
    [
      'DEV_VITE_ORIGIN',
      { ...validBindings, DEV_VITE_ORIGIN: 'http://localhost:70000' },
    ],
    [
      'DEV_VITE_ORIGIN',
      { ...validBindings, DEV_VITE_ORIGIN: 'https://vite.localhost/path' },
    ],
  ] as const)('rejects invalid %s without retaining its value', async (field, input) => {
    const exit = await Effect.runPromiseExit(parseRuntimeConfig(input))

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isSuccess(exit)) return

    const error = await Effect.runPromise(
      parseRuntimeConfig(input).pipe(Effect.flip)
    )
    expect(error.field).toBe(field)
    expect(JSON.stringify(error)).not.toContain('70000')
    expect(JSON.stringify(error)).not.toContain('short')
    expect(JSON.stringify(error)).not.toContain('/path')
  })
})
