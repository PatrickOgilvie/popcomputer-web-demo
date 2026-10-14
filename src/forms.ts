// The fields each form sends, which its action validates and its page types
// its form with. The browser imports this module only with `import type`.
import { Schema as S } from 'effect'
import { currentPassword, email, max, nullable, password, requiredString } from '@popcomputer/web/schema'

export const Visibility = S.Literals(['private', 'public'])

export const ProjectForm = S.Struct({
  name: requiredString.check(S.isMaxLength(100, { message: 'Use at most 100 characters.' })),
  description: nullable(max(500, 'Use at most 500 characters.')),
  visibility: Visibility,
})

// A password signs in exactly as it was chosen: currentPassword never trims it.
export const SignIn = S.Struct({ email, password: currentPassword })

export const Register = S.Struct({
  name: requiredString.check(S.isMaxLength(100, { message: 'Use at most 100 characters.' })),
  email,
  password: password({ min: 12, max: 128 }),
})
