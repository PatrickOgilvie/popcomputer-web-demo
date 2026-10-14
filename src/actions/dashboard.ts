import { and, desc, eq, gt } from 'drizzle-orm'
import { DateTime, Effect } from 'effect'
import { action, authorize, dbQuery, render } from '@popcomputer/web/effect'
import { columnsOf } from '@popcomputer/web/schema'
import { ProjectSummary } from '../pages'
import { projects, session } from '../schema'

export const showDashboard = action(
  Effect.gen(function* () {
    const auth = yield* authorize()
    const now = DateTime.toDateUtc(yield* DateTime.now)
    const ownProjects = eq(projects.userId, auth.user.id)

    const { recentProjects, projectCount, publicProjectCount, sessionCount } = yield* Effect.all({
      recentProjects: dbQuery((db) =>
        db.select(columnsOf(projects, ProjectSummary))
          .from(projects)
          .where(ownProjects)
          .orderBy(desc(projects.updatedAt))
          .limit(5)
      ),
      projectCount: dbQuery((db) => db.$count(projects, ownProjects)),
      publicProjectCount: dbQuery((db) => db.$count(projects, and(ownProjects, eq(projects.visibility, 'public')))),
      sessionCount: dbQuery((db) =>
        db.$count(session, and(eq(session.userId, auth.user.id), gt(session.expiresAt, now)))
      ),
    }, { concurrency: 'unbounded' })

    return yield* render('Dashboard', {
      recentProjects,
      projectCount,
      publicProjectCount,
      sessionCount,
      thisDevice: { userAgent: auth.session.userAgent, createdAt: auth.session.createdAt },
    })
  })
)
