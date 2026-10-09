import { Schema as S } from 'effect'

import type { Project } from '~/domain/project'
import type { ManagedSession } from '~/domain/session'
import { ProjectSummary, toProjectSummary } from '~/presentation/project'
import { SessionSummary, toSessionSummary } from '~/presentation/session'

/** Number of recently updated projects shown on the dashboard. */
export const RECENT_PROJECT_LIMIT = 3

const Count = S.Number.check(S.isInt(), S.isGreaterThanOrEqualTo(0))

/** Browser-safe account overview rendered by the dashboard. */
export const DashboardProps = S.Struct({
  projects: S.Struct({
    total: Count,
    public: Count,
    private: Count,
    recent: S.Array(ProjectSummary).check(S.isMaxLength(RECENT_PROJECT_LIMIT)),
  }),
  sessions: S.Struct({
    active: Count,
    current: S.NullOr(SessionSummary),
  }),
}).annotate({ identifier: 'DashboardProps' })

/** Browser-safe account overview rendered by the dashboard. */
export interface DashboardProps extends S.Schema.Type<typeof DashboardProps> {}

/** Summarizes owned projects and active sessions without exposing tokens. */
export function toDashboardProps(
  projects: ReadonlyArray<Project>,
  sessions: ReadonlyArray<ManagedSession>
): DashboardProps {
  const publicCount = projects.filter(
    (project) => project.visibility === 'public'
  ).length
  const recent = [...projects]
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
    .slice(0, RECENT_PROJECT_LIMIT)
    .map(toProjectSummary)
  const current = sessions.find((session) => session.isCurrent)

  return {
    projects: {
      total: projects.length,
      public: publicCount,
      private: projects.length - publicCount,
      recent,
    },
    sessions: {
      active: sessions.length,
      current: current === undefined ? null : toSessionSummary(current),
    },
  }
}
