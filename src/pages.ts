// Each page's props, as the Effect Schema `render` checks and encodes them
// with: a column the schema does not name never reaches the browser.
import { Schema as S, Struct } from 'effect'
import { tableSchema } from '@popcomputer/web/schema'
import * as schema from './schema'

export const ProjectSummary = tableSchema(schema.projects).mapFields(
  Struct.pick(['id', 'name', 'description', 'visibility', 'updatedAt'])
)

export const Project = tableSchema(schema.projects).mapFields(
  Struct.pick(['id', 'name', 'description', 'visibility', 'createdAt', 'updatedAt'])
)

export const PublicProject = tableSchema(schema.projects).mapFields(Struct.pick(['id', 'name', 'description', 'updatedAt']))

// A signed-in device: never its token, which only Better Auth reads.
export const Session = tableSchema(schema.session).mapFields((fields) => ({
  ...Struct.pick(fields, ['id', 'ipAddress', 'userAgent', 'createdAt', 'updatedAt', 'expiresAt']),
  current: S.Boolean,
}))

export const pages = {
  'Auth/Login': S.Struct({}),
  'Auth/Register': S.Struct({}),
  Dashboard: S.Struct({
    recentProjects: S.Array(ProjectSummary),
    projectCount: S.Number,
    publicProjectCount: S.Number,
    sessionCount: S.Number,
    thisDevice: tableSchema(schema.session).mapFields(Struct.pick(['userAgent', 'createdAt'])),
  }),
  'Projects/Index': S.Struct({ projects: S.Array(ProjectSummary) }),
  'Projects/Create': S.Struct({}),
  'Projects/Show': S.Struct({ project: Project }),
  'Projects/Edit': S.Struct({ project: Project }),
  'Projects/Public': S.Struct({ project: PublicProject }),
  'Sessions/Index': S.Struct({ sessions: S.Array(Session) }),
}
