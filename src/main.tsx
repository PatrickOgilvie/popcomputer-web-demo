import './styles.css'
import { createInertiaApp } from '@inertiajs/react'
import type { PageName } from '@popcomputer/web/effect'
import type { WebPage } from '@popcomputer/web/react'
import { createRoot } from 'react-dom/client'
import Login from './pages/Auth/Login'
import Register from './pages/Auth/Register'
import Dashboard from './pages/Dashboard'
import ErrorPage from './pages/Errors/Error'
import CreateProject from './pages/Projects/Create'
import EditProject from './pages/Projects/Edit'
import ProjectsIndex from './pages/Projects/Index'
import PublicProject from './pages/Projects/Public'
import ShowProject from './pages/Projects/Show'
import SessionsIndex from './pages/Sessions/Index'
import { appTitle } from './title'

// Every registered page's component: a page without one is a type error.
const components: { readonly [Name in PageName]: WebPage<Name> } = {
  'Auth/Login': Login,
  'Auth/Register': Register,
  Dashboard,
  'Projects/Index': ProjectsIndex,
  'Projects/Create': CreateProject,
  'Projects/Show': ShowProject,
  'Projects/Edit': EditProject,
  'Projects/Public': PublicProject,
  'Sessions/Index': SessionsIndex,
}

const isPage = (name: string): name is PageName => name in components

void createInertiaApp({
  title: (title) => (title ? `${title} · ${appTitle}` : appTitle),
  // The error page is not a registered page: it answers any other name.
  resolve: (name) => (isPage(name) ? components[name] : ErrorPage),
  setup({ el, App, props }) {
    if (el !== null) createRoot(el).render(<App {...props} />)
  },
})
