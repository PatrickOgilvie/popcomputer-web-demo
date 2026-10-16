import { setTimeout as sleep } from 'node:timers/promises'

import { paths } from '../src/paths'
import { parseJson, readFailure, runWrangler, type CommandResult } from './command'

/**
 * The page a readiness check asks for: it needs no sign-in, and answering it
 * takes the whole Worker, its routes and Inertia's page.
 */
export const READINESS_PATH = paths.login

/** A version's id as Cloudflare shortens it, in its Version URL and dashboard. */
export function shortVersion(versionId: string): string {
  return versionId.slice(0, 8)
}

/** What `wrangler versions upload` reports: the version's id, and its Version URL if it has one. */
export interface UploadedVersion {
  readonly versionId: string
  readonly previewUrl: string | undefined
}

/**
 * Whether an address's host fits DNS: each label 63 characters at most. A
 * Version URL puts the version's prefix before the Worker's name in one label,
 * so a Worker named with more than 54 characters has none that works.
 */
function fitsDns(url: string): boolean {
  try {
    return new URL(url).hostname.split('.').every((label) => label.length <= 63)
  } catch {
    return false
  }
}

/**
 * Reads the `version-upload` event `wrangler versions upload` writes. Its
 * `preview_url` is missing when the Worker has Version URLs turned off, or
 * can't have them, as a Worker with Durable Objects can't.
 */
export function readVersionUpload(events: ReadonlyArray<object>): UploadedVersion | undefined {
  for (const event of events) {
    if (!('type' in event) || event.type !== 'version-upload') continue
    if (!('version_id' in event) || typeof event.version_id !== 'string') return undefined
    const reported = 'preview_url' in event && typeof event.preview_url === 'string' ? event.preview_url : undefined
    const previewUrl = reported !== undefined && fitsDns(reported) ? reported : undefined
    return { versionId: event.version_id, previewUrl }
  }
  return undefined
}

/** Matches the error `wrangler versions upload` gives a Worker that doesn't exist yet. */
const NO_WORKER_TO_UPLOAD_TO = /cannot upload a new version of a Worker that does not yet exist/

/** What uploading a version came to. */
export type Upload =
  | { readonly kind: 'uploaded'; readonly version: UploadedVersion }
  | { readonly kind: 'no-worker' }
  | { readonly kind: 'failed' }

/**
 * Uploads the build as a new version of the Worker, without sending it any
 * traffic. Without -c, wrangler uploads the build's copy of wrangler.jsonc,
 * beside the Worker in dist/.
 */
export function uploadVersion(message: string): Upload {
  const run = runWrangler(['versions', 'upload', '--message', message])
  const version = readVersionUpload(run.events)
  if (run.ok && version !== undefined) return { kind: 'uploaded', version }
  const failed = readFailure(run.events)
  return failed !== undefined && NO_WORKER_TO_UPLOAD_TO.test(failed) ? { kind: 'no-worker' } : { kind: 'failed' }
}

/**
 * The Worker's workers.dev address, from one of its Version URLs:
 * `https://1a2b3c4d-book-club.ada.workers.dev` is a version of the Worker at
 * `https://book-club.ada.workers.dev`.
 */
export function readWorkersDevUrl(previewUrl: string): string | undefined {
  const host = /^https:\/\/[0-9a-f]{8}-([a-z0-9-]+\.[a-z0-9-]+\.workers\.dev)\/?$/.exec(previewUrl)?.[1]
  return host === undefined ? undefined : `https://${host}`
}

/**
 * Whether the Worker answers at its workers.dev address, as wrangler.jsonc
 * configures it: wrangler serves it there unless `workers_dev` is false, or
 * routes take its place without `workers_dev` set.
 */
export function servesWorkersDev(config: string): boolean {
  const workersDev = /"workers_dev"\s*:\s*(true|false)/.exec(config)?.[1]
  if (workersDev !== undefined) return workersDev === 'true'
  return !/"routes?"\s*:/.test(config)
}

/** Whether wrangler.jsonc turns the Worker's Version URLs off. */
export function turnsOffVersionUrls(config: string): boolean {
  return /"preview_urls"\s*:\s*false/.test(config)
}

/** What a readiness check found. */
export type Answer =
  | { readonly kind: 'ready' }
  /** Cloudflare Access asks visitors to sign in first, so the check can't see the app. */
  | { readonly kind: 'behind-access' }
  | { readonly kind: 'failed'; readonly reason: string }

export interface CheckOptions {
  readonly attempts?: number
  readonly intervalMs?: number
  readonly fetch?: (url: string, init: RequestInit) => Promise<Response>
}

function isAccessSignIn(location: string): boolean {
  try {
    return new URL(location).hostname.endsWith('.cloudflareaccess.com')
  } catch {
    return false
  }
}

/**
 * Asks for a page until it answers 200, for up to half a minute: a new
 * version, or a new workers.dev address, can take some seconds to start
 * answering. Redirects aren't followed, so a page that sends visitors
 * elsewhere doesn't count.
 */
export async function checkAnswers(url: string, options: CheckOptions = {}): Promise<Answer> {
  const attempts = options.attempts ?? 15
  const intervalMs = options.intervalMs ?? 2_000
  const get = options.fetch ?? fetch
  let reason = 'it never answered'
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await get(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
      await response.body?.cancel()
      if (response.status === 200) return { kind: 'ready' }
      const location = response.headers.get('Location')
      if (location !== null && isAccessSignIn(location)) return { kind: 'behind-access' }
      reason =
        location === null
          ? `it answered with status ${response.status}`
          : `it answered with status ${response.status}, sending visitors to ${location}`
    } catch (cause: unknown) {
      reason = `it couldn't be reached (${cause instanceof Error ? cause.message : String(cause)})`
    }
    if (attempt < attempts) await sleep(intervalMs)
  }
  return { kind: 'failed', reason }
}

/** The versions serving the Worker's traffic, from `wrangler deployments status --json`. */
export interface LiveDeployment {
  readonly createdOn: string
  readonly author: string | undefined
  readonly rollback: boolean
  readonly versions: ReadonlyArray<{ readonly versionId: string; readonly percentage: number }>
}

/** Matches wrangler's errors for a Worker that was never deployed, or doesn't exist. */
const NOTHING_DEPLOYED = /has no deployments|\[code: 10007\]|does not exist on your account/

function readVersionTraffic(versions: ReadonlyArray<unknown>): LiveDeployment['versions'] | undefined {
  const traffic: Array<LiveDeployment['versions'][number]> = []
  for (const version of versions) {
    if (typeof version !== 'object' || version === null) return undefined
    if (!('version_id' in version) || typeof version.version_id !== 'string') return undefined
    if (!('percentage' in version) || typeof version.percentage !== 'number') return undefined
    traffic.push({ versionId: version.version_id, percentage: version.percentage })
  }
  return traffic
}

/**
 * Reads what `wrangler deployments status --json` says is live: the latest
 * deployment, or 'none' for a Worker with nothing deployed. Any other
 * failure is unknown.
 */
export function readLiveDeployment(result: CommandResult): LiveDeployment | 'none' | undefined {
  if (result.status !== 0) return NOTHING_DEPLOYED.test(result.stderr) ? 'none' : undefined
  const report = parseJson(result.stdout)
  if (typeof report !== 'object' || report === null) return undefined
  if (!('created_on' in report) || typeof report.created_on !== 'string') return undefined
  if (!('versions' in report) || !Array.isArray(report.versions)) return undefined
  const versions = readVersionTraffic(report.versions)
  if (versions === undefined) return undefined
  const author = 'author_email' in report && typeof report.author_email === 'string' ? report.author_email : undefined
  const annotations = 'annotations' in report && typeof report.annotations === 'object' ? report.annotations : null
  const rollback =
    annotations !== null && 'workers/triggered_by' in annotations && annotations['workers/triggered_by'] === 'rollback'
  return { createdOn: report.created_on, author, rollback, versions }
}

/** How long ago a time was, in the largest whole unit. */
export function timeAgo(then: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000)
  const units: ReadonlyArray<readonly [string, number]> = [
    ['day', minutes / 1_440],
    ['hour', minutes / 60],
    ['minute', minutes],
  ]
  for (const [unit, amount] of units) {
    const whole = Math.floor(amount)
    if (whole >= 1) return `${whole} ${unit}${whole === 1 ? '' : 's'} ago`
  }
  return 'just now'
}

/** A time as `2026-10-17 09:12 UTC`. */
export function formatTime(time: Date): string {
  return `${time.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

/** What's live, in a sentence. */
export function describeLiveDeployment(deployment: LiveDeployment, now: Date): string {
  const versions = deployment.versions.map(({ versionId, percentage }) =>
    deployment.versions.length === 1 && percentage === 100
      ? `version ${shortVersion(versionId)}`
      : `version ${shortVersion(versionId)} (${percentage}% of requests)`
  )
  const deployed = new Date(deployment.createdOn)
  const by = deployment.author === undefined ? '' : ` by ${deployment.author}`
  const rollback = deployment.rollback ? ', as a rollback' : ''
  return `Live: ${versions.join(' and ')}, deployed ${formatTime(deployed)} (${timeAgo(deployed, now)})${by}${rollback}.`
}
