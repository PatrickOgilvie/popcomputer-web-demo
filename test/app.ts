import { expect } from 'bun:test'
import { testBrowser, testEnv, testRateLimiter, type TestBrowser } from '@popcomputer/web/testing'
import { app } from '../src/app'
import { paths } from '../src/paths'
import { databases } from './databases'
import '../src/routes'

export { app }

/** The Worker's bindings, with a new, empty D1 database. */
export async function freshEnv() {
  return testEnv({
    DB: await databases.fresh(),
    BETTER_AUTH_SECRET: 'test-only-secret-0123456789abcdef0123456789',
    SIGN_IN_LIMITER: testRateLimiter(),
    ENVIRONMENT: 'test',
  })
}

export type Env = Awaited<ReturnType<typeof freshEnv>>

export const password = 'correct horse battery'

/** A request as Inertia sends a form: its fields as JSON. */
export function send(method: 'POST' | 'PUT' | 'DELETE', fields: Record<string, unknown> = {}): RequestInit {
  return {
    method,
    headers: { 'X-Inertia': 'true', 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  }
}

/** Whether a response sends the visitor to sign in. */
export function asksToSignIn(res: Response): boolean {
  return new URL(res.headers.get('Location') ?? '/', 'http://localhost').pathname === paths.login
}

/** A visit to a page, as Inertia makes it. */
export const visit: RequestInit = { headers: { 'X-Inertia': 'true' } }

/** A member who registered through the form, signed in on a browser of their own. */
export async function register(env: Env, name: string, email = `${name.toLowerCase()}@example.com`): Promise<TestBrowser> {
  const browser = testBrowser(app, env)
  const res = await browser.request(paths.register, send('POST', { name, email, password }))

  expect(res.headers.get('Location')).toBe(paths.dashboard)

  return browser
}

/** The same member on another device. */
export async function signIn(env: Env, email: string): Promise<TestBrowser> {
  const browser = testBrowser(app, env)
  const res = await browser.request(paths.login, send('POST', { email, password }))

  expect(res.headers.get('Location')).toBe(paths.dashboard)

  return browser
}

/** Create a project through the form and return its id. */
export async function createProject(browser: TestBrowser, fields: Record<string, unknown> = {}): Promise<string> {
  const res = await browser.request(paths.projects, send('POST', { name: 'Apollo', description: null, visibility: 'private', ...fields }))
  const location = res.headers.get('Location') ?? ''
  const match = /^\/projects\/([^/]+)$/.exec(location)

  expect(match).not.toBeNull()

  return match?.[1] ?? ''
}
