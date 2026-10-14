import { Effect } from 'effect'
import { action, intendedUrl, invalid, validateRequest } from '@popcomputer/web/effect'
import { betterAuthRedirect } from '@popcomputer/web/auth'
import { Register, SignIn } from '../forms'
import { paths } from '../paths'

const tooManyAttempts = (seconds: number | undefined) =>
  invalid({ email: `Too many attempts. Try again in ${seconds ?? 60} seconds.` })

export const signIn = action(
  Effect.gen(function* () {
    const input = yield* validateRequest(SignIn)
    const redirectTo = yield* intendedUrl(paths.dashboard)

    return yield* betterAuthRedirect('signInEmail', { body: input }, {
      redirectTo,
      errors: (error) => ({ email: error.message }),
    })
  }).pipe(Effect.catchTag('AuthRateLimitError', (error) => tooManyAttempts(error.retryAfterSeconds)))
)

export const signUp = action(
  Effect.gen(function* () {
    const input = yield* validateRequest(Register)

    return yield* betterAuthRedirect('signUpEmail', { body: input }, {
      redirectTo: paths.dashboard,
      errors: (error) => ({ email: error.message }),
    })
  }).pipe(Effect.catchTag('AuthRateLimitError', (error) => tooManyAttempts(error.retryAfterSeconds)))
)
