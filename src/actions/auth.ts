import { Effect, Option, Redacted, Schema as S } from 'effect'
import {
  betterAuthLogoutAction,
  type BetterAuthActionError,
} from '@popcomputer/web/auth'
import { AuthUserService } from '@popcomputer/web/effect'
import { SessionLifecycle } from '~/application/session-lifecycle'
import { requiredString, email } from '@popcomputer/web/schema'
import { PasswordSecret } from '~/domain/auth-credentials'
import { parseSessionActor } from '~/domain/session'
import { revokeBeforeClearingCredentials } from '~/http/authoritative-logout'
import {
  callBetterAuthHandler,
  defineBetterAuthStrictForm,
} from '~/http/better-auth-form'
import { toSessionHttpFailure } from '~/http/session-http'

const LoginSchema = S.Struct({
  email,
  password: PasswordSecret,
})

const RegisterSchema = S.Struct({
  name: requiredString,
  email,
  password: PasswordSecret,
})

function credentialProviderRequest(
  request: Request,
  path: '/sign-in/email' | '/sign-up/email',
  body: Record<string, string>
): Request {
  const headers = new Headers(request.headers)
  headers.delete('content-length')
  headers.set('content-type', 'application/json')

  return new Request(new URL(`/api/auth${path}`, request.url), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

const mapLoginError = (error: BetterAuthActionError): Record<string, string> => {
  switch (error.code) {
    case 'INVALID_EMAIL':
    case 'INVALID_EMAIL_OR_PASSWORD':
    case 'EMAIL_NOT_VERIFIED':
      return { email: 'Invalid email or password' }
    case 'CROSS_SITE_NAVIGATION_LOGIN_BLOCKED':
    case 'INVALID_ORIGIN':
    case 'MISSING_OR_NULL_ORIGIN':
      return { email: 'Request blocked. Please try again.' }
    default:
      return { email: 'Unable to sign in. Please try again.' }
  }
}

const mapRegisterError = (error: BetterAuthActionError): Record<string, string> => {
  switch (error.code) {
    case 'INVALID_EMAIL':
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return { email: 'Email is already in use' }
    case 'PASSWORD_TOO_SHORT':
      return { password: 'Use at least 8 characters' }
    case 'PASSWORD_TOO_LONG':
      return { password: 'Use 128 characters or fewer' }
    case 'INVALID_PASSWORD':
      return { password: 'Choose a different password' }
    case 'CROSS_SITE_NAVIGATION_LOGIN_BLOCKED':
    case 'INVALID_ORIGIN':
    case 'MISSING_OR_NULL_ORIGIN':
      return { email: 'Request blocked. Please try again.' }
    default:
      return { email: 'Unable to register. Please try again.' }
  }
}

const loginForm = defineBetterAuthStrictForm({
  name: 'Auth.login',
  schema: LoginSchema,
  errorComponent: 'Auth/Login',
  redirectTo: '/',
  errorMapper: mapLoginError,
  call: (auth, input, request) =>
    callBetterAuthHandler(
      auth,
      credentialProviderRequest(request, '/sign-in/email', {
        email: input.email,
        password: Redacted.value(input.password),
      })
    ),
})

const registerForm = defineBetterAuthStrictForm({
  name: 'Auth.register',
  schema: RegisterSchema,
  errorComponent: 'Auth/Register',
  redirectTo: '/',
  errorMapper: mapRegisterError,
  call: (auth, input, request) =>
    callBetterAuthHandler(
      auth,
      credentialProviderRequest(request, '/sign-up/email', {
        name: input.name,
        email: input.email,
        password: Redacted.value(input.password),
      })
    ),
})

export const loginUser = loginForm.handler

export const registerUser = registerForm.handler

const clearLogoutCookies = betterAuthLogoutAction({
  redirectTo: '/login',
})

const authoritativeLogout = Effect.fn('Auth.logout')(function* () {
  const authenticated = yield* Effect.serviceOption(AuthUserService)

  if (Option.isSome(authenticated)) {
    const actor = yield* parseSessionActor(authenticated.value).pipe(
      Effect.mapError(toSessionHttpFailure)
    )
    const lifecycle = yield* SessionLifecycle

    const revoke = lifecycle
      .endCurrent(actor)
      .pipe(Effect.mapError(toSessionHttpFailure))

    return yield* revokeBeforeClearingCredentials(
      revoke,
      clearLogoutCookies
    )
  }

  return yield* clearLogoutCookies
})()

/** Revokes the server session before clearing browser credentials. */
export const logoutUser = authoritativeLogout
