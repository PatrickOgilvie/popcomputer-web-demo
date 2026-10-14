import { describe, expect, test } from 'bun:test'
import { readPage, testBrowser } from '@popcomputer/web/testing'
import { paths } from '../src/paths'
import { app, asksToSignIn, freshEnv, password, register, send, visit } from './app'

describe('registering', () => {
  test('signs the new member in and opens their dashboard', async () => {
    const browser = await register(await freshEnv(), 'Ada')
    const dashboard = await readPage(await browser.request(paths.dashboard, visit), 'Dashboard')

    expect(dashboard.props.auth.user?.email).toBe('ada@example.com')
    expect(dashboard.props.projectCount).toBe(0)
    expect(dashboard.props.sessionCount).toBe(1)
  })

  test('refuses a short password beside its field', async () => {
    const browser = testBrowser(app, await freshEnv())
    const res = await browser.request(paths.register, send('POST', { name: 'Ada', email: 'ada@example.com', password: 'short' }))
    const form = await readPage(await browser.follow(res), 'Auth/Register')

    expect(form.props.errors.password).toBeDefined()
  })

  test('refuses an email another member registered', async () => {
    const env = await freshEnv()
    await register(env, 'Ada')
    const browser = testBrowser(app, env)
    const res = await browser.request(paths.register, send('POST', { name: 'Imposter', email: 'ada@example.com', password }))
    const form = await readPage(await browser.follow(res), 'Auth/Register')

    expect(form.props.errors.email).toBeDefined()
    expect(form.props.auth.user).toBeNull()
  })
})

describe('signing in', () => {
  test('refuses a wrong password without saying which half was wrong', async () => {
    const env = await freshEnv()
    await register(env, 'Ada')
    const browser = testBrowser(app, env)
    const res = await browser.request(paths.login, send('POST', { email: 'ada@example.com', password: 'not the password' }))
    const form = await readPage(await browser.follow(res), 'Auth/Login')

    expect(form.props.errors.email).toMatch(/invalid email or password/i)
    expect(form.props.auth.user).toBeNull()
  })

  test('returns a guest to the page that asked them to sign in', async () => {
    const env = await freshEnv()
    await register(env, 'Ada')
    const browser = testBrowser(app, env)

    const asked = await browser.request(paths.projects)

    expect(asked.headers.get('Location')).toBe('/login?redirect=%2Fprojects')
    await readPage(await browser.follow(asked), 'Auth/Login')

    const res = await browser.request(paths.login, send('POST', { email: 'ada@example.com', password }))

    expect(res.headers.get('Location')).toBe(paths.projects)
  })
})

describe('signing out', () => {
  test('ends the session, so the next visit asks to sign in', async () => {
    const browser = await register(await freshEnv(), 'Ada')
    const res = await browser.request(paths.logout, send('POST'))

    expect(res.headers.get('Location')).toBe(paths.login)
    expect(asksToSignIn(await browser.request(paths.dashboard))).toBe(true)
  })
})
