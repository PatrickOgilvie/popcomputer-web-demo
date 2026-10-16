import type { D1Database, RateLimit } from '@cloudflare/workers-types'

/** The Worker's bindings, as wrangler.jsonc and the secrets declare them. */
export type Bindings = {
  DB: D1Database
  BETTER_AUTH_SECRET: string
  SIGN_IN_LIMITER: RateLimit
  /** `bun run dev` sets development, wrangler.jsonc production, and the tests test. */
  ENVIRONMENT?: 'development' | 'production' | 'test'
}

export type Env = { Bindings: Bindings }
