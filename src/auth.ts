import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { Database } from './db'
import * as schema from './schema'

export interface CreateAuthOptions {
  readonly db: Database
  readonly secret: string
  readonly baseURL: string
  readonly advanced?: BetterAuthOptions['advanced']
  readonly logger?: BetterAuthOptions['logger']
}

export function createAuth(options: CreateAuthOptions) {
  return betterAuth({
    database: drizzleAdapter(options.db, { provider: 'sqlite', schema }),
    secret: options.secret,
    baseURL: options.baseURL,
    emailAndPassword: { enabled: true },
    logger: options.logger,
    // setupWeb's auth.signInLimits limits signing in, up and every password
    // call by address and account. Better Auth's own limits stay on too, in
    // each isolate's memory, writing nothing.
    rateLimit: { enabled: true, storage: 'memory' },
    advanced: {
      ...options.advanced,
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'], ...options.advanced?.ipAddress },
    },
  })
}
