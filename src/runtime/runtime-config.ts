import { Effect, Result, Schema as S } from 'effect'
import type { MiddlewareHandler } from 'hono'

import { AuthSecret, type AuthSecret as AuthSecretValue } from '~/domain/auth-credentials'

const DEFAULT_VITE_ORIGIN = 'http://localhost:5173'

/** Deployment modes with deliberately closed rendering and diagnostics behavior. */
export const DeploymentMode = S.Literals(['development', 'production'])

/** A parsed application deployment mode. */
export type DeploymentMode = S.Schema.Type<typeof DeploymentMode>

const StrictScalarText = S.String.check(S.isPattern(/^\S+$/u))

const HttpOrigin = StrictScalarText.pipe(S.decodeTo(S.URLFromString)).check(
  S.makeFilter((url) => {
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:'
    const hasExactHost = !url.hostname.includes('*')
    const hasOnlyOrigin =
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === ''

    return isHttp && hasExactHost && hasOnlyOrigin
      ? undefined
      : 'Expected an exact HTTP(S) origin without wildcards, credentials, path, query, or hash.'
  })
)

/** Scalar Worker bindings consumed by the runtime configuration boundary. */
export interface RuntimeConfigBindings {
  readonly APP_ORIGIN?: string
  readonly BETTER_AUTH_SECRET?: string
  readonly BETTER_AUTH_TRUSTED_ORIGINS?: string
  readonly DEV_VITE_ORIGIN?: string
  readonly ENVIRONMENT?: string
}

/** Parsed scalar configuration shared by request composition callbacks. */
export interface RuntimeConfig {
  readonly mode: DeploymentMode
  readonly appOrigin: URL
  readonly authSecret: AuthSecretValue
  readonly trustedOrigins: ReadonlyArray<URL>
  readonly viteOrigin: URL
}

/** Runtime configuration fields safe to identify in diagnostics. */
export const RuntimeConfigField = S.Literals([
  'ENVIRONMENT',
  'APP_ORIGIN',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_TRUSTED_ORIGINS',
  'DEV_VITE_ORIGIN',
])

/** A safe startup diagnostic that never retains the rejected configuration value. */
export class InvalidRuntimeConfig extends S.TaggedError<InvalidRuntimeConfig>()(
  'InvalidRuntimeConfig',
  {
    field: RuntimeConfigField,
    reason: S.String,
  }
) {}

function decodeField<A, I>(
  field: S.Schema.Type<typeof RuntimeConfigField>,
  schema: S.Codec<A, I>,
  input: unknown
): Effect.Effect<A, InvalidRuntimeConfig> {
  return S.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError(
      () =>
        new InvalidRuntimeConfig({
          field,
          reason: 'missing-or-invalid',
        })
    )
  )
}

function trustedOriginInputs(value: string | undefined): ReadonlyArray<string> {
  return value === undefined ? [] : value.split(',').map((origin) => origin.trim())
}

function isLoopbackOrigin(origin: URL): boolean {
  return (
    origin.hostname === 'localhost' ||
    origin.hostname === '127.0.0.1' ||
    origin.hostname === '[::1]' ||
    origin.hostname === '::1'
  )
}

function requireSecureProductionOrigin(
  mode: DeploymentMode,
  field: 'APP_ORIGIN' | 'BETTER_AUTH_TRUSTED_ORIGINS',
  origin: URL,
  allowLoopbackHttp: boolean
): Effect.Effect<void, InvalidRuntimeConfig> {
  if (
    mode !== 'production' ||
    origin.protocol === 'https:' ||
    (allowLoopbackHttp && isLoopbackOrigin(origin))
  ) {
    return Effect.void
  }

  return Effect.fail(
    new InvalidRuntimeConfig({
      field,
      reason: 'https-required-in-production',
    })
  )
}

/** Parses raw Worker scalar bindings into one safe request configuration. */
export const parseRuntimeConfig = Effect.fn('RuntimeConfig.parse')(function* (
  bindings: RuntimeConfigBindings
) {
  const mode = yield* decodeField(
    'ENVIRONMENT',
    DeploymentMode,
    bindings.ENVIRONMENT
  )
  const appOrigin = yield* decodeField(
    'APP_ORIGIN',
    HttpOrigin,
    bindings.APP_ORIGIN
  )
  const authSecret = yield* decodeField(
    'BETTER_AUTH_SECRET',
    AuthSecret,
    bindings.BETTER_AUTH_SECRET
  )
  const trustedOrigins = yield* decodeField(
    'BETTER_AUTH_TRUSTED_ORIGINS',
    S.Array(HttpOrigin),
    trustedOriginInputs(bindings.BETTER_AUTH_TRUSTED_ORIGINS)
  )
  const viteOrigin = yield* decodeField(
    'DEV_VITE_ORIGIN',
    HttpOrigin,
    bindings.DEV_VITE_ORIGIN ?? DEFAULT_VITE_ORIGIN
  )

  yield* requireSecureProductionOrigin(
    mode,
    'APP_ORIGIN',
    appOrigin,
    true
  )
  yield* Effect.forEach(trustedOrigins, (origin) =>
    requireSecureProductionOrigin(
      mode,
      'BETTER_AUTH_TRUSTED_ORIGINS',
      origin,
      isLoopbackOrigin(appOrigin)
    )
  )

  return {
    mode,
    appOrigin,
    authSecret,
    trustedOrigins,
    viteOrigin,
  } satisfies RuntimeConfig
})

/** Hono environment contract for the parsed runtime-config middleware. */
export type RuntimeConfigEnv = {
  readonly Bindings: RuntimeConfigBindings
  readonly Variables: { readonly runtimeConfig: RuntimeConfig }
}

/**
 * Parses scalar bindings before setupWeb creates request-scoped dependencies.
 * Invalid configuration fails closed with a value-free diagnostic.
 */
export const runtimeConfigMiddleware: MiddlewareHandler<RuntimeConfigEnv> =
  async (context, next) => {
    const parsed = await Effect.runPromise(
      Effect.result(parseRuntimeConfig(context.env))
    )

    if (Result.isFailure(parsed)) {
      console.error('Runtime configuration is invalid.', {
        errorType: parsed.failure._tag,
        field: parsed.failure.field,
        reason: parsed.failure.reason,
      })

      return context.json(
        { message: 'The application is not configured correctly.' },
        500
      )
    }

    context.set('runtimeConfig', parsed.success)
    await next()
    return context.res
  }
