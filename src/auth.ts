import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { Database } from './db'
import type { Email } from './email'
import { paths } from './paths'
import * as schema from './schema'

export interface CreateAuthOptions {
  readonly db: Database
  readonly secret: string
  /** The origin emailed links name: APP_URL, never the request's URL. */
  readonly baseURL: string
  /** Delivers an email: src/email.ts's sendEmail. */
  readonly sendEmail: (email: Email) => Promise<void>
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
    // Better Auth trusts forms from baseURL alone. Trusting the page's own
    // address too, as setupWeb's cross-site check does, lets a member sign in
    // at a Version URL `bun run preview` shares; emailed links still name
    // baseURL.
    trustedOrigins: (request) => (request === undefined ? [] : [new URL(request.url).origin]),
    // A password signs in only once its address is proven, so an account
    // registered with someone else's address holds no session.
    emailAndPassword: { enabled: true, requireEmailVerification: true },
    // The link proves the address and signs nobody in: the member signs in
    // next. Signing in before then, with the right password, emails a new
    // link, since a sign-up for a registered address sends nothing.
    emailVerification: {
      sendOnSignIn: true,
      sendVerificationEmail: ({ user, token }) =>
        options.sendEmail({
          to: user.email,
          subject: 'Confirm your email address',
          text:
            `Confirm your email address to finish signing up:\n${options.baseURL}${paths.verifyEmail}?${new URLSearchParams({ token })}\n\n` +
            'If you did not sign up, ignore this email and do not follow the link: ' +
            'whoever signed up with your address chose its password, and confirming it would let them sign in as you.',
        }),
    },
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
