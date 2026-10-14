import { describe, expect, test } from 'bun:test'
import { href } from '@popcomputer/web/paths'
import { readPage, type TestBrowser } from '@popcomputer/web/testing'
import { paths } from '../src/paths'
import { asksToSignIn, freshEnv, register, send, signIn, visit } from './app'

const sessionsOf = async (browser: TestBrowser) =>
  (await readPage(await browser.request(paths.sessions, visit), 'Sessions/Index')).props.sessions

describe('signed-in devices', () => {
  test('lists each of the member’s devices, marking the one in use, without its token', async () => {
    const env = await freshEnv()
    const laptop = await register(env, 'Ada')
    await signIn(env, 'ada@example.com')
    const sessions = await sessionsOf(laptop)

    expect(sessions).toHaveLength(2)
    expect(sessions.filter((session) => session.current)).toHaveLength(1)
    expect(sessions.every((session) => !('token' in session))).toBe(true)
  })

  test('signing another device out ends its session', async () => {
    const env = await freshEnv()
    const laptop = await register(env, 'Ada')
    const phone = await signIn(env, 'ada@example.com')
    const other = (await sessionsOf(laptop)).find((session) => !session.current)
    const res = await laptop.request(href(paths.session, { session: other?.id ?? '' }), send('DELETE'))

    expect(res.headers.get('Location')).toBe(paths.sessions)
    expect(asksToSignIn(await phone.request(paths.dashboard))).toBe(true)
    expect(await sessionsOf(laptop)).toHaveLength(1)
  })

  test('the device in use is refused, beside the list, and stays signed in', async () => {
    const browser = await register(await freshEnv(), 'Ada')
    const current = (await sessionsOf(browser)).find((session) => session.current)
    const res = await browser.request(href(paths.session, { session: current?.id ?? '' }), send('DELETE'))
    const page = await readPage(await browser.follow(res), 'Sessions/Index')

    expect(page.props.errors.session).toBeDefined()
    expect(page.props.sessions).toHaveLength(1)
  })

  test('another member’s device is a 404, and stays signed in', async () => {
    const env = await freshEnv()
    const ada = await register(env, 'Ada')
    const grace = await register(env, 'Grace')
    const [graceSession] = await sessionsOf(grace)

    expect((await ada.request(href(paths.session, { session: graceSession?.id ?? '' }), send('DELETE'))).status).toBe(404)
    expect(await sessionsOf(grace)).toHaveLength(1)
  })

  test('signing every other device out keeps this one', async () => {
    const env = await freshEnv()
    const laptop = await register(env, 'Ada')
    const phone = await signIn(env, 'ada@example.com')
    const tablet = await signIn(env, 'ada@example.com')

    await laptop.request(paths.otherSessions, send('DELETE'))

    expect(await sessionsOf(laptop)).toHaveLength(1)
    expect(asksToSignIn(await phone.request(paths.dashboard))).toBe(true)
    expect(asksToSignIn(await tablet.request(paths.dashboard))).toBe(true)
  })
})
