import type { D1Database, RateLimit, SendEmail } from '@cloudflare/workers-types'
import { Schema as S } from 'effect'
import { defineEnv, randomSecret, secret, variable, type EnvBindings } from '@popcomputer/web/env'

/**
 * The Worker's vars and secrets, each declared once. The Worker checks them
 * before it serves, `bun run env:check` checks them locally and on
 * Cloudflare, and `bun run deploy` won't deploy without them.
 */
export const env = defineEnv({
  /**
   * Signs sessions. `bun run dev` and the first deploy each make one;
   * replacing it signs everyone out.
   */
  BETTER_AUTH_SECRET: secret(S.String.check(S.isMinLength(32)), { generate: randomSecret }),
  /**
   * The address the app is served at, such as https://app.example.com: the
   * origin Better Auth's emailed links name, so they never follow the host a
   * request arrived on. `bun run dev` sets its own address, the tests theirs,
   * and the first deploy writes the workers.dev address into wrangler.jsonc.
   */
  APP_URL: variable(
    S.String.check(
      S.isPattern(/^https?:\/\/[^/?#\s]+$/, {
        expected: 'an origin, such as https://app.example.com, with no path or trailing slash',
      })
    )
  ),
  /**
   * The address sign-up emails come from, which turns sending them on, with
   * the send_email binding EMAIL. Cloudflare Email Sending needs Workers Paid
   * and the address's domain on Cloudflare, so the template leaves it off:
   * without it, each email is written to the log instead.
   */
  EMAIL_FROM: variable(
    S.String.check(S.isPattern(/^[^\s@<>]+@[^\s@<>]+$/, { expected: 'an email address, such as hello@example.com' })),
    { optional: true }
  ),
  /** `bun run dev` sets development, wrangler.jsonc production, and the tests test. */
  ENVIRONMENT: variable(S.Literals(['development', 'production', 'test'])),
})

/** The Worker's bindings: the vars and secrets above, and those wrangler.jsonc declares. */
export type Bindings = EnvBindings<typeof env> & {
  DB: D1Database
  SIGN_IN_LIMITER: RateLimit
  /** Cloudflare Email Sending, once an app turns it on: README's "Sending email". */
  EMAIL?: SendEmail
}

export type Env = { Bindings: Bindings }
