import { action, render, RequireAuthLayer, RequireGuestLayer } from '@popcomputer/web/effect'
import { betterAuthLogoutAction } from '@popcomputer/web/auth'
import { signIn, signUp } from './actions/auth'
import { showDashboard } from './actions/dashboard'
import {
  createProject,
  deleteProject,
  editProject,
  listProjects,
  showProject,
  showPublicProject,
  updateProject,
} from './actions/projects'
import { listSessions, revokeOtherSessions, revokeSession } from './actions/sessions'
import { routes } from './app'
import { paths } from './paths'

routes
  .provide(RequireGuestLayer)
  .get(paths.login, action(render('Auth/Login')))
  .post(paths.login, signIn)
  .get(paths.register, action(render('Auth/Register')))
  .post(paths.register, signUp)

routes.post(paths.logout, betterAuthLogoutAction({ redirectTo: paths.login }))

// Anyone may see a project its owner made public.
routes.get(paths.publicProject, showPublicProject)

routes
  .provide(RequireAuthLayer)
  .get(paths.dashboard, showDashboard)
  .get(paths.projects, listProjects)
  .get(paths.newProject, action(render('Projects/Create')))
  .post(paths.projects, createProject, { form: paths.newProject })
  .get(paths.project, showProject)
  .get(paths.editProject, editProject)
  .put(paths.project, updateProject, { form: paths.editProject })
  .delete(paths.project, deleteProject)
  .get(paths.sessions, listSessions)
  .delete(paths.otherSessions, revokeOtherSessions)
  .delete(paths.session, revokeSession, { form: paths.sessions })
