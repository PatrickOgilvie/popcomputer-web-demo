import { Effect } from 'effect'
import { action, render } from '@popcomputer/web/effect'

import { Projects } from '~/application/projects'
import { SessionLifecycle } from '~/application/session-lifecycle'
import {
  currentProjectActor,
  toProjectHttpFailure,
} from '~/http/project-http'
import {
  currentSessionActor,
  toSessionHttpFailure,
} from '~/http/session-http'
import { toDashboardProps } from '~/presentation/dashboard'

/** Summarizes the signed-in user's projects and devices in one request. */
export const showDashboard = action(
  Effect.fn('Dashboard.show')(function* () {
    const projectActor = yield* currentProjectActor
    const sessionActor = yield* currentSessionActor
    const projects = yield* Projects
    const lifecycle = yield* SessionLifecycle

    const [owned, sessions] = yield* Effect.all(
      [
        projects
          .listOwned(projectActor)
          .pipe(Effect.mapError(toProjectHttpFailure)),
        lifecycle
          .list(sessionActor)
          .pipe(Effect.mapError(toSessionHttpFailure)),
      ],
      { concurrency: 2 }
    )

    return yield* render(
      'Dashboard',
      toDashboardProps(
        owned.map(({ project }) => project),
        sessions
      )
    )
  })()
)
