import { and, desc, eq, gt } from 'drizzle-orm'
import { DateTime, Effect } from 'effect'
import {
  action,
  authorize,
  bound,
  dbQuery,
  flash,
  invalid,
  redirect,
  render,
} from '@popcomputer/web/effect'
import { betterAuthCall } from '@popcomputer/web/auth'
import { columnsOf } from '@popcomputer/web/schema'
import { Session } from '../pages'
import { paths } from '../paths'
import { session } from '../schema'

/** The devices signed in to the member's account, the current one marked. */
export const listSessions = action(
  Effect.gen(function* () {
    const auth = yield* authorize()
    const now = DateTime.toDateUtc(yield* DateTime.now)
    const rows = yield* dbQuery((db) =>
      db.select(columnsOf(session, Session))
        .from(session)
        .where(and(eq(session.userId, auth.user.id), gt(session.expiresAt, now)))
        .orderBy(desc(session.updatedAt))
    )

    return yield* render('Sessions/Index', {
      sessions: rows.map((row) => ({ ...row, current: row.id === auth.session.id })),
    })
  })
)

/** Signs another of the member's devices out, through Better Auth. */
export const revokeSession = action(
  Effect.gen(function* () {
    const auth = yield* authorize()
    // Only the member's own sessions load: the binding is ownedBy 'userId'.
    const device = yield* bound('session')

    if (device.id === auth.session.id) return yield* invalid({ session: 'Sign out to end the session you are using.' })

    yield* betterAuthCall('revokeSession', { body: { token: device.token } })
    yield* flash('success', 'Signed that device out.')

    return yield* redirect(paths.sessions)
  })
)

/** Signs every device but this one out, through Better Auth. */
export const revokeOtherSessions = action(
  Effect.gen(function* () {
    yield* authorize()
    yield* betterAuthCall('revokeOtherSessions', {})
    yield* flash('success', 'Signed every other device out.')

    return yield* redirect(paths.sessions)
  })
)
