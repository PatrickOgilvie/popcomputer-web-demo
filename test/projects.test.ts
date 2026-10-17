import { describe, expect, test } from 'bun:test'
import { href } from '@popcomputer/web/paths'
import { readPage, testBrowser } from '@popcomputer/web/testing'
import { paths } from '../src/paths'
import { app, createProject, freshEnv, register, send, visit } from './app'

describe('a member’s projects', () => {
  test('creating one opens it, with a message, and lists it', async () => {
    const browser = await register(await freshEnv(), 'Ada')
    const res = await browser.request(paths.projects, send('POST', { name: 'Apollo', description: 'To the moon', visibility: 'private' }))
    const page = await readPage(await browser.follow(res), 'Projects/Show')

    expect(page.props.project).toMatchObject({ name: 'Apollo', description: 'To the moon', visibility: 'private' })
    expect(page.flash.success).toBe('Project created.')

    const index = await readPage(await browser.request(paths.projects, visit), 'Projects/Index')

    expect(index.props.projects.map((project) => project.name)).toEqual(['Apollo'])
  })

  test('a blank name goes back to the form with the error beside its field', async () => {
    const browser = await register(await freshEnv(), 'Ada')
    const res = await browser.request(paths.projects, send('POST', { name: '  ', description: null, visibility: 'private' }))
    const form = await readPage(await browser.follow(res), 'Projects/Create')

    expect(form.props.errors.name).toBeDefined()
  })

  test('saving changes them, and the public page follows its visibility', async () => {
    const env = await freshEnv()
    const browser = await register(env, 'Ada')
    const id = await createProject(browser)
    const publicPath = href(paths.publicProject, { publicProject: id })
    const guest = testBrowser(app, env)

    expect((await guest.request(publicPath, visit)).status).toBe(404)

    const res = await browser.request(href(paths.project, { project: id }), send('PUT', {
      name: 'Apollo 11',
      description: 'Landed',
      visibility: 'public',
    }))

    expect(res.headers.get('Location')).toBe(href(paths.project, { project: id }))

    const shared = await readPage(await guest.request(publicPath, visit), 'Projects/Public')

    expect(shared.props.project).toEqual({
      id,
      name: 'Apollo 11',
      description: 'Landed',
      updatedAt: expect.any(String),
    })
  })

  test('deleting one removes it and its public page', async () => {
    const env = await freshEnv()
    const browser = await register(env, 'Ada')
    const id = await createProject(browser, { visibility: 'public' })

    await browser.request(href(paths.project, { project: id }), send('DELETE'))

    expect((await browser.request(href(paths.project, { project: id }), visit)).status).toBe(404)
    expect((await testBrowser(app, env).request(href(paths.publicProject, { publicProject: id }), visit)).status).toBe(404)
  })

  test('the owner a form names is ignored: a project belongs to the member who made it', async () => {
    const env = await freshEnv()
    const ada = await register(env, 'Ada')
    const grace = await register(env, 'Grace')
    const graceId = (await readPage(await grace.request(paths.dashboard, visit), 'Dashboard')).props.auth.user?.id
    const id = await createProject(ada, { userId: graceId })

    expect((await ada.request(href(paths.project, { project: id }), visit)).status).toBe(200)
    expect((await grace.request(href(paths.project, { project: id }), visit)).status).toBe(404)
  })
})

describe('another member’s project', () => {
  test('is the same 404 as a missing one, to read, edit, change or delete', async () => {
    const env = await freshEnv()
    const ada = await register(env, 'Ada')
    const grace = await register(env, 'Grace')
    const id = await createProject(ada)
    const project = href(paths.project, { project: id })

    expect((await grace.request(project, visit)).status).toBe(404)
    expect((await grace.request(href(paths.editProject, { project: id }), visit)).status).toBe(404)
    expect((await grace.request(project, send('PUT', { name: 'Mine now', description: null, visibility: 'public' }))).status).toBe(404)
    expect((await grace.request(project, send('DELETE'))).status).toBe(404)

    const unchanged = await readPage(await ada.request(project, visit), 'Projects/Show')

    expect(unchanged.props.project).toMatchObject({ name: 'Apollo', visibility: 'private' })
  })
})

describe('the dashboard', () => {
  test('counts the member’s own projects and nobody else’s', async () => {
    const env = await freshEnv()
    const ada = await register(env, 'Ada')
    const grace = await register(env, 'Grace')
    await createProject(ada, { name: 'Apollo', visibility: 'public' })
    await createProject(ada, { name: 'Gemini' })
    await createProject(grace, { name: 'Mercury' })

    const dashboard = await readPage(await ada.request(paths.dashboard, visit), 'Dashboard')

    expect(dashboard.props.projectCount).toBe(2)
    expect(dashboard.props.publicProjectCount).toBe(1)
    expect(dashboard.props.recentProjects.map((project) => project.name).sort()).toEqual(['Apollo', 'Gemini'])
  })
})
