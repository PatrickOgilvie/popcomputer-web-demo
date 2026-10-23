import { describe, expect, spyOn, test } from 'bun:test'
import { readPage, testBrowser } from '@popcomputer/web/testing'
import { paths } from '../src/paths'
import { app, asksToSignIn, emailedLink, freshEnv, mailbox, password, register, send, visit } from './app'

describe('registering', () => {
  test('signs the new member in and opens their dashboard, once their address is confirmed', async () => {
    const browser = await register(await freshEnv(), 'Ada')
    const dashboard = await readPage(await browser.request(paths.dashboard, visit), 'Dashboard')

    expect(dashboard.props.auth.user?.email).toBe('ada@example.com')
    expect(dashboard.props.projectCount).toBe(0)
    expect(dashboard.props.sessionCount).toBe(1)
  })

  test('emails a link to confirm the address, and signs no one in until it is followed', async () => {
    const env = await freshEnv()
    const browser = testBrowser(app, env)
    const res = await browser.request(paths.register, send('POST', { name: 'Ada', email: 'ada@example.com', password }))
    const sent = await readPage(await browser.follow(res), 'Auth/CheckEmail')

    expect(sent.props.sendsEmail).toBe(true)
    expect(sent.props.auth.user).toBeNull()
    expect(asksToSignIn(await browser.request(paths.dashboard))).toBe(true)
    expect(mailbox(env).sent).toMatchObject([
      { to: 'ada@example.com', from: { email: 'hello@example.com' }, subject: 'Confirm your email address' },
    ])
    expect(emailedLink(env, 'ada@example.com')).toStartWith(`${paths.verifyEmail}?token=`)

    const confirmed = await browser.request(emailedLink(env, 'ada@example.com'))
    const login = await readPage(await browser.follow(confirmed), 'Auth/Login')

    expect(login.flash.success).toBe('Your email address is confirmed. Sign in to continue.')
    expect(login.props.auth.user).toBeNull()
  })

  test('names APP_URL in the link, whatever host the sign-up arrived at', async () => {
    const env = await freshEnv()
    const res = await app.request(
      'https://elsewhere.example/register',
      {
        ...send('POST', { name: 'Ada', email: 'ada@example.com', password }),
        headers: { 'X-Inertia': 'true', 'Content-Type': 'application/json', Origin: 'https://elsewhere.example' },
      },
      env
    )

    expect(res.headers.get('Location')).toBe(paths.checkEmail)
    expect(mailbox(env).sent[0]?.text).toContain(`http://localhost${paths.verifyEmail}?token=`)
    expect(mailbox(env).sent[0]?.text).not.toContain('elsewhere.example')
  })

  test('refuses a short password beside its field', async () => {
    const browser = testBrowser(app, await freshEnv())
    const res = await browser.request(paths.register, send('POST', { name: 'Ada', email: 'ada@example.com', password: 'short' }))
    const form = await readPage(await browser.follow(res), 'Auth/Register')

    expect(form.props.errors.password).toBeDefined()
  })

  test('answers an email another member registered as it answers a new one, and sends nothing', async () => {
    const env = await freshEnv()
    await register(env, 'Ada')
    const browser = testBrowser(app, env)
    const res = await browser.request(paths.register, send('POST', { name: 'Imposter', email: 'ada@example.com', password }))

    expect(res.headers.get('Location')).toBe(paths.checkEmail)
    expect(mailbox(env).sent).toHaveLength(1)
    expect(asksToSignIn(await browser.request(paths.dashboard))).toBe(true)
  })

  test('sends a link that expired, or was never sent, to sign-in, saying so', async () => {
    const browser = testBrowser(app, await freshEnv())

    for (const link of [`${paths.verifyEmail}?token=not-a-token`, paths.verifyEmail]) {
      expect((await browser.request(link)).headers.get('Location')).toBe(`${paths.login}?error=link_expired`)
    }
  })

  test('writes the email to the log while Cloudflare Email Sending is off', async () => {
    const env = await freshEnv({ sendsEmail: false })
    const log = spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      const browser = testBrowser(app, env)
      const res = await browser.request(paths.register, send('POST', { name: 'Ada', email: 'ada@example.com', password }))
      const sent = await readPage(await browser.follow(res), 'Auth/CheckEmail')

      expect(sent.props.sendsEmail).toBe(false)
      expect(log.mock.calls.join('\n')).toContain(`To: ada@example.com`)
      expect(log.mock.calls.join('\n')).toContain(`http://localhost${paths.verifyEmail}?token=`)
    } finally {
      log.mockRestore()
    }
  })
})

describe('signing in', () => {
  test('refuses an address not yet confirmed, and emails a new link', async () => {
    const env = await freshEnv()
    const browser = testBrowser(app, env)
    await browser.request(paths.register, send('POST', { name: 'Ada', email: 'ada@example.com', password }))
    const res = await browser.request(paths.login, send('POST', { email: 'ada@example.com', password }))
    const form = await readPage(await browser.follow(res), 'Auth/Login')

    expect(form.props.errors.email).toMatch(/confirm your email address first/i)
    expect(form.props.auth.user).toBeNull()
    expect(mailbox(env).sent).toHaveLength(2)
  })

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
