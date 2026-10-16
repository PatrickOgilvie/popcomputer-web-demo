import { describe, expect, test } from 'bun:test'

import {
  checkAnswers,
  describeLiveDeployment,
  readLiveDeployment,
  readVersionUpload,
  readWorkersDevUrl,
  servesWorkersDev,
  timeAgo,
  turnsOffVersionUrls,
} from './versions'

const versionId = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

describe('version upload', () => {
  // The event `wrangler versions upload` writes to WRANGLER_OUTPUT_FILE_PATH.
  const uploaded = (previewUrl: string | null) => [
    { version: 1, type: 'wrangler-session', wrangler_version: '4.151.0', command_line_args: ['versions', 'upload'] },
    { version: 1, type: 'version-upload', worker_name: 'book-club', version_id: versionId, preview_url: previewUrl },
  ]

  test('reads the new version and its Version URL', () => {
    const version = readVersionUpload(uploaded('https://1a2b3c4d-book-club.ada.workers.dev'))

    expect(version).toEqual({ versionId, previewUrl: 'https://1a2b3c4d-book-club.ada.workers.dev' })
  })

  test('reads no Version URL when Cloudflare gave the version none', () => {
    expect(readVersionUpload(uploaded(null))).toEqual({ versionId, previewUrl: undefined })
  })

  test("reads no Version URL when the Worker's name leaves it too long for DNS", () => {
    const name = 'a'.repeat(58)

    expect(readVersionUpload(uploaded(`https://1a2b3c4d-${name}.ada.workers.dev`))?.previewUrl).toBeUndefined()
  })

  test('reads nothing without the event', () => {
    expect(readVersionUpload([{ version: 1, type: 'command-failed', message: 'Authentication error' }])).toBeUndefined()
  })

  test("finds the Worker's workers.dev address from a Version URL", () => {
    expect(readWorkersDevUrl('https://1a2b3c4d-book-club.ada.workers.dev')).toBe('https://book-club.ada.workers.dev')
    expect(readWorkersDevUrl('https://books.example.com')).toBeUndefined()
  })
})

describe('wrangler.jsonc', () => {
  test('serves workers.dev unless workers_dev is false or routes take its place', () => {
    expect(servesWorkersDev('{ "name": "book-club" }')).toBe(true)
    expect(servesWorkersDev('{ "workers_dev": false }')).toBe(false)
    expect(servesWorkersDev('{ "routes": [{ "pattern": "books.example.com", "custom_domain": true }] }')).toBe(false)
    expect(servesWorkersDev('{ "workers_dev": true, "routes": [] }')).toBe(true)
  })

  test('reads Version URLs turned off only when preview_urls is false', () => {
    expect(turnsOffVersionUrls('{ "preview_urls": false }')).toBe(true)
    expect(turnsOffVersionUrls('{ "preview_urls": true }')).toBe(false)
    expect(turnsOffVersionUrls('{}')).toBe(false)
  })
})

describe('readiness check', () => {
  /** A fetch that answers each request with the next response, recording what it was asked. */
  function answering(...responses: ReadonlyArray<() => Response>) {
    const asked: Array<{ url: string; redirect: RequestRedirect | undefined }> = []
    const fetch = async (url: string, init: RequestInit) => {
      asked.push({ url, redirect: init.redirect })
      const next = responses[Math.min(asked.length, responses.length) - 1]
      if (next === undefined) throw new Error('no response')
      return next()
    }
    return { fetch, asked }
  }

  test('passes when the page answers 200, asking without following redirects', async () => {
    const { fetch, asked } = answering(() => new Response('ok'))

    expect(await checkAnswers('https://1a2b3c4d-book-club.ada.workers.dev/login', { fetch })).toEqual({ kind: 'ready' })
    expect(asked).toEqual([{ url: 'https://1a2b3c4d-book-club.ada.workers.dev/login', redirect: 'manual' }])
  })

  test('asks again while a new version starts answering', async () => {
    const { fetch, asked } = answering(
      () => new Response(null, { status: 404 }),
      () => new Response(null, { status: 404 }),
      () => new Response('ok')
    )

    expect(await checkAnswers('https://x.workers.dev/login', { fetch, intervalMs: 0 })).toEqual({ kind: 'ready' })
    expect(asked).toHaveLength(3)
  })

  test('fails with the last answer once it runs out of attempts', async () => {
    const { fetch } = answering(() => new Response(null, { status: 302, headers: { Location: '/' } }))

    expect(await checkAnswers('https://x.workers.dev/login', { fetch, attempts: 3, intervalMs: 0 })).toEqual({
      kind: 'failed',
      reason: 'it answered with status 302, sending visitors to /',
    })
  })

  test("says when the address can't be reached at all", async () => {
    const fetch = async () => {
      throw new Error('Unable to connect. Is the computer able to access the url?')
    }

    expect(await checkAnswers('https://x.workers.dev/login', { fetch, attempts: 1 })).toEqual({
      kind: 'failed',
      reason: "it couldn't be reached (Unable to connect. Is the computer able to access the url?)",
    })
  })

  test('recognises Cloudflare Access asking visitors to sign in', async () => {
    const location = 'https://ada.cloudflareaccess.com/cdn-cgi/access/login/x.workers.dev?kid=abc'
    const { fetch } = answering(() => new Response(null, { status: 302, headers: { Location: location } }))

    expect(await checkAnswers('https://x.workers.dev/login', { fetch })).toEqual({ kind: 'behind-access' })
  })
})

describe('live deployment', () => {
  // What `wrangler deployments status --json` prints: the latest deployment.
  const deployment = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify(
      {
        id: '0f9e8d7c-6b5a-4c3d-9e2f-1a0b9c8d7e6f',
        source: 'wrangler',
        strategy: 'percentage',
        author_email: 'ada@example.com',
        annotations: { 'workers/triggered_by': 'deployment', 'workers/message': 'bun run deploy' },
        versions: [{ version_id: versionId, percentage: 100 }],
        created_on: '2026-10-17T09:12:30.123456Z',
        ...overrides,
      },
      null,
      2
    )
  const ok = (stdout: string) => ({ status: 0, stdout, stderr: '' })
  const now = new Date('2026-10-17T11:40:00Z')

  test("says what's live, when, and who deployed it", () => {
    const live = readLiveDeployment(ok(deployment()))
    if (live === undefined || live === 'none') throw new Error('expected a deployment')

    expect(describeLiveDeployment(live, now)).toBe(
      'Live: version 1a2b3c4d, deployed 2026-10-17 09:12 UTC (2 hours ago) by ada@example.com.'
    )
  })

  test('names each version sharing the traffic, and a rollback', () => {
    const stdout = deployment({
      annotations: { 'workers/triggered_by': 'rollback' },
      versions: [
        { version_id: versionId, percentage: 90 },
        { version_id: '9f8e7d6c-0000-4000-8000-000000000000', percentage: 10 },
      ],
    })
    const live = readLiveDeployment(ok(stdout))
    if (live === undefined || live === 'none') throw new Error('expected a deployment')

    expect(describeLiveDeployment(live, now)).toBe(
      'Live: version 1a2b3c4d (90% of requests) and version 9f8e7d6c (10% of requests), deployed 2026-10-17 09:12 UTC (2 hours ago) by ada@example.com, as a rollback.'
    )
  })

  test('reads nothing live for a Worker never deployed, or not there at all', () => {
    const noDeployments = { status: 1, stdout: '', stderr: '✘ [ERROR] The Worker book-club has no deployments.' }
    const notFound = {
      status: 1,
      stdout: '',
      stderr: [
        '✘ [ERROR] A request to the Cloudflare API (/accounts/abc/workers/scripts/book-club/deployments) failed.',
        '',
        '  This Worker does not exist on your account. [code: 10007]',
      ].join('\n'),
    }

    expect(readLiveDeployment(noDeployments)).toBe('none')
    expect(readLiveDeployment(notFound)).toBe('none')
  })

  test('reads neither when wrangler failed some other way', () => {
    expect(readLiveDeployment({ status: 1, stdout: '', stderr: '✘ [ERROR] Authentication error [code: 10000]' })).toBeUndefined()
    expect(readLiveDeployment(ok('not json'))).toBeUndefined()
  })

  test('counts time in the largest whole unit', () => {
    const at = (iso: string) => new Date(iso)

    expect(timeAgo(at('2026-10-17T11:39:30Z'), now)).toBe('just now')
    expect(timeAgo(at('2026-10-17T11:39:00Z'), now)).toBe('1 minute ago')
    expect(timeAgo(at('2026-10-17T10:40:00Z'), now)).toBe('1 hour ago')
    expect(timeAgo(at('2026-10-14T11:40:00Z'), now)).toBe('3 days ago')
  })
})
