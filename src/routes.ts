import type { Hono } from 'hono'
import { Layer } from 'effect'

import {
  effectRoutes,
  RequireAuthLayer,
  RequireGuestLayer,
  render,
} from '@popcomputer/web/effect'
import { showDashboard } from '~/actions/dashboard'
import { loginUser, logoutUser, registerUser } from '~/actions/auth'
import {
  createProject,
  destroyProject,
  editProject,
  listProjectsApi,
  showProject,
  showProjects,
  showPublicProject,
  storeProject,
  updateProject,
} from '~/actions/projects'
import {
  revokeOtherSessions,
  revokeSession,
  showSessions,
} from '~/actions/sessions'
import { D1ProjectStoreLive } from '~/adapters/d1-project-store'
import { BetterAuthSessionLifecycleLayer } from '~/adapters/better-auth-sessions'
import { ProjectsLive } from '~/application/projects'
import { ProjectParams } from '~/domain/project'
import { RevokeSessionInput } from '~/domain/session'
import { requireAuthenticatedRequest } from '~/http/require-authenticated-request'
import {
  deleteStrictForm,
  postStrictForm,
  putStrictForm,
} from '~/http/strict-form-route'
import { ProjectApiIndexResponse } from '~/presentation/project'
import type { AppEnv } from '~/types'

const ProjectApplicationLive = ProjectsLive.pipe(
  Layer.provide(D1ProjectStoreLive)
)

/** Registers authentication, public showcase, and protected application routes. */
export function registerRoutes(app: Hono<AppEnv>) {
  // Better Auth remains an internal provider. Browser-safe app routes below
  // are the only public authentication and session-management surface.
  app.all('/api/auth/*', (context) => context.notFound())

  const routes = effectRoutes(app)
  const guests = routes.provide(RequireGuestLayer)
  guests.get('/login', render('Auth/Login'), { name: 'login.show' })
  guests.post('/login', loginUser, { name: 'login.store' })
  guests.get('/register', render('Auth/Register'), {
    name: 'registration.show',
  })
  guests.post('/register', registerUser, {
    name: 'registration.store',
  })
  routes
    .provide(BetterAuthSessionLifecycleLayer)
    .post('/logout', logoutUser, { name: 'logout.destroy' })

  effectRoutes(app).get(
    '/showcase/projects/{project}',
    showPublicProject,
    {
      name: 'projects.public',
      params: ProjectParams,
    }
  )

  const authenticated = effectRoutes(app)
    .middleware(requireAuthenticatedRequest)
    .provide(RequireAuthLayer)

  authenticated
    .provide(ProjectApplicationLive)
    .provide(BetterAuthSessionLifecycleLayer)
    .get('/', showDashboard, { name: 'dashboard.show' })

  authenticated
    .provide(BetterAuthSessionLifecycleLayer)
    .group((route) => {
      route.get('/sessions', showSessions, { name: 'sessions.index' })
      postStrictForm(route, '/sessions/revoke', revokeSession, {
        name: 'sessions.revoke',
      })
      route.post('/sessions/revoke-others', revokeOtherSessions, {
        name: 'sessions.destroy',
      })
    })

  authenticated.provide(ProjectApplicationLive).group((route) => {
    route.get('/api/projects', listProjectsApi, {
      name: 'projects.list',
      response: ProjectApiIndexResponse,
    })
    route.get('/projects', showProjects, { name: 'projects.index' })
    route.get('/projects/create', createProject, {
      name: 'projects.create',
    })
    postStrictForm(route, '/projects', storeProject, {
      name: 'projects.store',
    })
    route.get('/projects/:project', showProject, {
      name: 'projects.show',
      params: ProjectParams,
    })
    route.get('/projects/:project/edit', editProject, {
      name: 'projects.edit',
      params: ProjectParams,
    })
    putStrictForm(route, '/projects/:project', updateProject, {
      name: 'projects.update',
      params: ProjectParams,
    })
    deleteStrictForm(route, '/projects/:project', destroyProject, {
      name: 'projects.destroy',
      params: ProjectParams,
    })
  })
}
