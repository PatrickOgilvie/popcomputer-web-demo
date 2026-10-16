import { Effect } from 'effect'
import { action, intendedUrl, invalid, validateRequest } from '@popcomputer/web/effect'
import { betterAuthRedirect, type BetterAuthActionError } from '@popcomputer/web/auth'
import { Register, SignIn } from '../forms'
import { paths } from '../paths'

// Better Auth turns away a form without the Origin header every browser sends,
// so only a script such as curl meets these, and its email isn't to blame.
const rejected = (error: BetterAuthActionError) =>
  error.code?.endsWith('ORIGIN') === true
    ? { form: `${error.message}: send the app's address as the Origin header, as a browser does.` }
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

export const signUp = action(
  Effect.gen(function* () {
    const input = yield* validateRequest(Register)

    return yield* betterAuthRedirect('signUpEmail', { body: input }, {
      redirectTo: paths.dashboard,
      errors: rejected,
    })
  }).pipe(Effect.catchTag('AuthRateLimitError', (error) => tooManyAttempts(error.retryAfterSeconds)))
)
