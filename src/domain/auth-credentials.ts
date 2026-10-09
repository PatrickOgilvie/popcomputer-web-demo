import { Schema as S } from 'effect'

const OpaqueNonEmptyText = S.String.check(
  S.isMinLength(1, { message: 'This field is required' })
)

const PasswordText = OpaqueNonEmptyText.check(
  S.isMaxLength(128, { message: 'Password must be at most 128 characters' })
)

/** A password that preserves whitespace and remains redacted after parsing. */
export const PasswordSecret = S.RedactedFromValue(PasswordText, {
  label: 'Password',
  disallowEncode: true,
})

/** A parsed, redacted password. */
export type PasswordSecret = S.Schema.Type<typeof PasswordSecret>

const AuthSecretText = S.String.check(
  S.isMinLength(32, {
    message: 'The authentication secret must contain at least 32 characters.',
  }),
  S.isPattern(/^\S+$/u, {
    message: 'The authentication secret must not contain whitespace.',
  })
)

/** A high-entropy Better Auth secret kept redacted outside the auth adapter. */
export const AuthSecret = S.RedactedFromValue(AuthSecretText, {
  label: 'BETTER_AUTH_SECRET',
  disallowEncode: true,
})

/** A parsed, redacted Better Auth secret. */
export type AuthSecret = S.Schema.Type<typeof AuthSecret>

/** A Better Auth session token kept redacted outside the provider adapter. */
export const SessionToken = S.RedactedFromValue(OpaqueNonEmptyText, {
  label: 'SessionToken',
  disallowEncode: true,
})

/** A parsed, redacted Better Auth session token. */
export type SessionToken = S.Schema.Type<typeof SessionToken>

/** Validates a session token that has already crossed into redacted memory. */
export const RedactedSessionToken = S.Redacted(OpaqueNonEmptyText, {
  disallowJsonEncode: true,
})
