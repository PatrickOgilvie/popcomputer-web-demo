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

/** Better Auth's messages, without "Invalid password": a mistyped password is routine. */
const log: NonNullable<BetterAuthOptions['logger']>['log'] = (level, message, ...args) => {
  if (message === 'Invalid password') return
  const write = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  write(`[Better Auth] ${message}`, ...args)
}

export function createAuth(options: CreateAuthOptions) {
  return betterAuth({
    database: drizzleAdapter(options.db, { provider: 'sqlite', schema }),
    secret: options.secret,
    baseURL: options.baseURL,
    emailAndPassword: { enabled: true },
    logger: { log, ...options.logger },
    // setupWeb's auth.signInLimits limits signing in, up and every password
    // call by address and account. Better Auth's own limits stay on too, in
    // each isolate's memory, writing nothing.
    rateLimit: { enabled: true, storage: 'memory' },
    advanced: {
      ...options.advanced,
      // Cloudflare's header, which a client cannot write; X-Forwarded-For it can.
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'], ...options.advanced?.ipAddress },
    },
  })
}
