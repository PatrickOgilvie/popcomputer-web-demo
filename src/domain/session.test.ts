import { describe, expect, test } from 'bun:test'
import { Effect, Redacted } from 'effect'

import {
  InvalidSessionActor,
  parseSessionActor,
} from '~/domain/session'

function authenticatedSession(userId = 'user-123', sessionUserId = userId) {
  return {
    user: { id: userId },
    session: {
      id: 'session-current',
      userId: sessionUserId,
      token: Redacted.make('current-session-token'),
    },
  }
}

describe('session actor', () => {
  test('parses a consistent authenticated session without unwrapping its token', async () => {
    const input = authenticatedSession()
    const actor = await Effect.runPromise(parseSessionActor(input))

    expect(String(actor.userId)).toBe('user-123')
    expect(String(actor.currentSessionId)).toBe('session-current')
    // Schema.Redacted re-wraps decoded values, so compare the secret, not the box.
    expect(Redacted.isRedacted(actor.currentToken)).toBe(true)
    expect(Redacted.value(actor.currentToken)).toBe(
      Redacted.value(input.session.token)
    )
    expect(String(actor.currentToken)).not.toContain('current-session-token')
  })

  test('rejects an authenticated session owned by a different user', async () => {
    const error = await Effect.runPromise(
      Effect.flip(parseSessionActor(authenticatedSession('user-123', 'user-456')))
    )

    expect(error).toBeInstanceOf(InvalidSessionActor)
    expect(error.reason).toBe('owner-mismatch')
    expect(Object.keys(error)).not.toContain('currentToken')
  })

  test('rejects an unredacted current token', async () => {
    const input = authenticatedSession()
    const error = await Effect.runPromise(
      Effect.flip(
        parseSessionActor({
          ...input,
          session: {
            ...input.session,
            token: 'unredacted-token',
          },
        })
      )
    )

    expect(error).toBeInstanceOf(InvalidSessionActor)
    expect(error.reason).toBe('invalid-authenticated-session')
  })

  test('rejects an empty token even when it is already redacted', async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        parseSessionActor({
          user: { id: 'user-123' },
          session: {
            id: 'session-current',
            userId: 'user-123',
            token: Redacted.make(''),
          },
        })
      )
    )

    expect(error.reason).toBe('invalid-authenticated-session')
  })
})
