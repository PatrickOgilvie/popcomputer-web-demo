import { expect } from 'bun:test'
import type { EmailMessage, EmailMessageBuilder, EmailSendResult, SendEmail } from '@cloudflare/workers-types'
import { testBrowser, testEnv, testRateLimiter, type TestBrowser } from '@popcomputer/web/testing'
import { app } from '../src/app'
import { paths } from '../src/paths'
import { databases } from './databases'
import '../src/routes'

export { app }

/** Cloudflare Email Sending's binding, keeping each email it was asked to send. */
export class TestMailbox implements SendEmail {
  readonly sent: Array<EmailMessageBuilder> = []

  send(message: EmailMessage | EmailMessageBuilder): Promise<EmailSendResult> {
    if ('subject' in message) this.sent.push(message)
    return Promise.resolve({ messageId: `test-${this.sent.length}` })
  }
}

/**
 * The Worker's bindings, with a new, empty D1 database, and Cloudflare Email
 * Sending on unless `sendsEmail` is false, as it is in the template.
 */
export async function freshEnv({ sendsEmail = true } = {}) {
  return testEnv({
    DB: await databases.fresh(),
    BETTER_AUTH_SECRET: 'test-only-secret-0123456789abcdef0123456789',
    // The address the tests' requests go to, as bun run dev's are its own.
    APP_URL: 'http://localhost',
    ...(sendsEmail ? { EMAIL: new TestMailbox(), EMAIL_FROM: 'hello@example.com' } : {}),
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

/** The emails the app sent, through the TestMailbox freshEnv gives it. */
export function mailbox(env: Env): TestMailbox {
  if (!(env.EMAIL instanceof TestMailbox)) throw new Error('freshEnv gives EMAIL a TestMailbox unless sendsEmail is false.')
  return env.EMAIL
}

/** The path and query of the link in the last email sent to an address. */
export function emailedLink(env: Env, to: string): string {
  const email = mailbox(env).sent.filter((message) => message.to === to).at(-1)
  const link = /https?:\/\/\S+/.exec(email?.text ?? '')?.[0]

  expect(link).toBeDefined()

  const url = new URL(link ?? '/', 'http://localhost')
  return `${url.pathname}${url.search}`
}

/**
 * A member who registered through the form, followed the link emailed to
 * them, and signed in, on a browser of their own.
 */
export async function register(env: Env, name: string, email = `${name.toLowerCase()}@example.com`): Promise<TestBrowser> {
  const browser = testBrowser(app, env)
  const registered = await browser.request(paths.register, send('POST', { name, email, password }))

  expect(registered.headers.get('Location')).toBe(paths.checkEmail)

  const confirmed = await browser.request(emailedLink(env, email))

  expect(confirmed.headers.get('Location')).toBe(paths.login)

  const signedIn = await browser.request(paths.login, send('POST', { email, password }))

  expect(signedIn.headers.get('Location')).toBe(paths.dashboard)

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
