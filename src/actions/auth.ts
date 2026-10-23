import { Config, Effect, Schema as S } from 'effect'
import { action, config, flash, intendedUrl, invalid, redirect, render, validateRequest } from '@popcomputer/web/effect'
import { betterAuthRedirect, type BetterAuthActionError } from '@popcomputer/web/auth'
import { href } from '@popcomputer/web/paths'
import { requiredString } from '@popcomputer/web/schema'
import { Register, SignIn } from '../forms'
import { paths } from '../paths'

// Better Auth turns away a form without the Origin header every browser sends,
// so only a script such as curl meets these, and its email isn't to blame.
// Signing in before confirming the address emails a new link (sendOnSignIn).
const rejected = (error: BetterAuthActionError) =>
  error.code?.endsWith('ORIGIN') === true
    ? { form: `${error.message}: send the app's address as the Origin header, as a browser does.` }
    : error.code === 'EMAIL_NOT_VERIFIED'
      ? { email: 'Confirm your email address first: we’ve sent you a new link. Follow it, then sign in.' }
      : { email: error.message }

const tooManyAttempts = (seconds: number | undefined) =>
  invalid({ email: `Too many attempts. Try again in ${seconds ?? 60} seconds.` })

export const signIn = action(
  Effect.gen(function* () {
    const input = yield* validateRequest(SignIn)
    const redirectTo = yield* intendedUrl(paths.dashboard)

    return yield* betterAuthRedirect('signInEmail', { body: input }, {
      redirectTo,
      errors: rejected,
    })
  }).pipe(Effect.catchTag('AuthRateLimitError', (error) => tooManyAttempts(error.retryAfterSeconds)))
)

// Signs no one in: Better Auth emails a link to prove the address, and a
// sign-up for a registered address is answered the same, sending nothing,
// so the form tells no one who has an account.
export const signUp = action(
  Effect.gen(function* () {
    const input = yield* validateRequest(Register)

    return yield* betterAuthRedirect('signUpEmail', { body: input }, {
      redirectTo: paths.checkEmail,
      errors: rejected,
    })
  }).pipe(Effect.catchTag('AuthRateLimitError', (error) => tooManyAttempts(error.retryAfterSeconds)))
)

// Says where the link went: an app without Cloudflare Email Sending writes it to the log.
export const showCheckEmail = action(
  Effect.gen(function* () {
    const sender = yield* config.string('EMAIL_FROM').pipe(Config.withDefault(''))

    return yield* render('Auth/CheckEmail', { sendsEmail: sender !== '' })
  })
)

// The emailed link: it proves the address and signs nobody in. One that
// expired, after an hour, or was used already lands on sign-in with ?error=.
export const verifyEmail = action(
  Effect.gen(function* () {
    const input = yield* validateRequest(S.Struct({ token: requiredString }))
    const confirmed = yield* betterAuthRedirect('verifyEmail', { query: input }, { redirectTo: paths.login })
    yield* flash('success', 'Your email address is confirmed. Sign in to continue.')

    return confirmed
  }).pipe(Effect.catchTag('ValidationError', () => redirect(href(paths.login, {}, { error: 'link_expired' }))))
)
