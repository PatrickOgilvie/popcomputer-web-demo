// Every route's path, declared once: routes register on them, actions
// redirect to them and pages link to them with href.
export const paths = {
  dashboard: '/',
  login: '/login',
  register: '/register',
  logout: '/logout',
  projects: '/projects',
  newProject: '/projects/create',
  project: '/projects/{project}',
  editProject: '/projects/{project}/edit',
  publicProject: '/showcase/projects/{publicProject}',
  sessions: '/sessions',
  otherSessions: '/sessions/others',
  session: '/sessions/{session}',
} as const
