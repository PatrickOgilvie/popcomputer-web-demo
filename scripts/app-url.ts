import { readFileSync, writeFileSync } from 'node:fs'

import { capture, failure, parseJson } from './command'
import { readWranglerVars } from './env'
import { servesWorkersDev } from './versions'

/** The address wrangler.jsonc's vars give the app as APP_URL, if they give one. */
export function readAppUrl(config: string): string | undefined {
  const url = readWranglerVars(config).APP_URL
  return typeof url === 'string' ? url : undefined
}

/**
 * Puts APP_URL first in wrangler.jsonc's vars, keeping the rest of the file
 * as it is; nothing when it has no vars to put it in.
 */
export function writeAppUrl(config: string, url: string): string | undefined {
  const vars = /"vars"\s*:\s*\{/.exec(config)
  if (vars === null) return undefined
  const at = vars.index + vars[0].length
  const rest = config.slice(at)
  const entry = `"APP_URL": ${JSON.stringify(url)}`
  return `${config.slice(0, at)} ${/^\s*\}/.test(rest) ? `${entry} ` : `${entry},`}${rest}`
}

/** The Worker's name in wrangler.jsonc. */
export function readWorkerName(config: string): string | undefined {
  const parsed: unknown = Bun.JSONC.parse(config)
  if (typeof parsed !== 'object' || parsed === null || !('name' in parsed)) return undefined
  return typeof parsed.name === 'string' ? parsed.name : undefined
}

/**
 * The account wrangler deploys to, as wrangler picks it: CLOUDFLARE_ACCOUNT_ID,
 * then wrangler.jsonc's account_id, then the login's account when it has one
 * only. `whoami` is what `wrangler whoami --json` printed.
 */
export function readAccountId(fromEnvironment: string | undefined, config: string, whoami: () => string): string | undefined {
  if (fromEnvironment !== undefined && fromEnvironment !== '') return fromEnvironment
  const parsed: unknown = Bun.JSONC.parse(config)
  if (typeof parsed === 'object' && parsed !== null && 'account_id' in parsed && typeof parsed.account_id === 'string') {
    return parsed.account_id
  }
  const report = parseJson(whoami())
  if (typeof report !== 'object' || report === null || !('accounts' in report) || !Array.isArray(report.accounts)) return undefined
  const accounts: ReadonlyArray<unknown> = report.accounts
  const [account] = accounts
  if (accounts.length !== 1 || typeof account !== 'object' || account === null || !('id' in account)) return undefined
  return typeof account.id === 'string' ? account.id : undefined
}

/**
 * The headers that sign a Cloudflare API request with wrangler's own login,
 * from `wrangler auth token --json`: a token, or a global API key with its
 * email.
 */
export function readAuthHeaders(output: string): Readonly<Record<string, string>> | undefined {
  const auth = parseJson(output)
  if (typeof auth !== 'object' || auth === null || !('type' in auth)) return undefined
  if ((auth.type === 'oauth' || auth.type === 'api_token') && 'token' in auth && typeof auth.token === 'string') {
    return { Authorization: `Bearer ${auth.token}` }
  }
  if (auth.type === 'api_key' && 'key' in auth && typeof auth.key === 'string' && 'email' in auth && typeof auth.email === 'string') {
    return { 'X-Auth-Key': auth.key, 'X-Auth-Email': auth.email }
  }
  return undefined
}

/** What Cloudflare said of the account's workers.dev subdomain. */
export type Subdomain =
  | { readonly kind: 'found'; readonly subdomain: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'failed'; readonly reason: string }

/** Cloudflare's code for an account that hasn't chosen a workers.dev subdomain yet. */
const NO_SUBDOMAIN = 10007

/** Reads the answer to `GET /accounts/{id}/workers/subdomain`. */
export function readSubdomain(status: number, body: unknown): Subdomain {
  if (typeof body === 'object' && body !== null && 'result' in body) {
    const { result } = body
    if (typeof result === 'object' && result !== null && 'subdomain' in result && typeof result.subdomain === 'string') {
      return { kind: 'found', subdomain: result.subdomain }
    }
  }
  const errors: ReadonlyArray<unknown> =
    typeof body === 'object' && body !== null && 'errors' in body && Array.isArray(body.errors) ? body.errors : []
  if (errors.some((error) => typeof error === 'object' && error !== null && 'code' in error && error.code === NO_SUBDOMAIN)) {
    return { kind: 'none' }
  }
  const messages = errors.flatMap((error) =>
    typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' ? [error.message] : []
  )
  return { kind: 'failed', reason: messages.length > 0 ? messages.join('; ') : `Cloudflare answered ${status}` }
}

/** Asks Cloudflare for the account's workers.dev subdomain. */
async function fetchSubdomain(
  accountId: string,
  headers: Readonly<Record<string, string>>,
  get: typeof fetch
): Promise<Subdomain> {
  try {
    const response = await get(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    })
    return readSubdomain(response.status, parseJson(await response.text()))
  } catch (cause: unknown) {
    return { kind: 'failed', reason: cause instanceof Error ? cause.message : String(cause) }
  }
}

/**
 * Gives wrangler.jsonc's vars an APP_URL, the address Better Auth's emailed
 * links name, when they have none: the Worker's workers.dev address, from
 * the account's subdomain, which Cloudflare's API tells wrangler's login.
 * One already there is kept, so an app served at a domain of its own sets
 * that instead. `rerun` is the command to run once a problem is fixed.
 */
export async function appUrlProblem(rerun: string, path = 'wrangler.jsonc', get: typeof fetch = fetch): Promise<string | undefined> {
  const config = readFileSync(path, 'utf8')
  if (readAppUrl(config) !== undefined) return undefined

  const yourself = `add "APP_URL": "https://…", the address the app is served at, to vars in wrangler.jsonc, then run ${rerun} again.`
  const name = readWorkerName(config)
  if (name === undefined) return `wrangler.jsonc names no Worker, so there's no workers.dev address for APP_URL: ${yourself}`
  if (!servesWorkersDev(config)) {
    return `wrangler.jsonc serves the Worker on routes, not at its workers.dev address, so ${rerun} can't tell where emailed links should go: ${yourself}`
  }

  const accountId = readAccountId(process.env.CLOUDFLARE_ACCOUNT_ID, config, () => capture('wrangler', ['whoami', '--json']).stdout)
  if (accountId === undefined) {
    return `Your Cloudflare login has more than one account, so ${rerun} can't tell which workers.dev address the app has. Set CLOUDFLARE_ACCOUNT_ID to the account to deploy to, or ${yourself}`
  }
  const token = capture('wrangler', ['auth', 'token', '--json'])
  const headers = readAuthHeaders(token.stdout)
  if (headers === undefined) return failure(token, `Could not read wrangler's Cloudflare login; wrangler says why above. Or ${yourself}`)

  const found = await fetchSubdomain(accountId, headers, get)
  if (found.kind === 'none') {
    return `The Cloudflare account has no workers.dev subdomain yet. Choose one at https://dash.cloudflare.com/${accountId}/workers/onboarding, then run ${rerun} again; or ${yourself}`
  }
  if (found.kind === 'failed') {
    return `Could not ask Cloudflare for the account's workers.dev subdomain (${found.reason}). Run ${rerun} again, or ${yourself}`
  }

  const url = `https://${name}.${found.subdomain}.workers.dev`
  const written = writeAppUrl(config, url)
  if (written === undefined) return `wrangler.jsonc has no vars to put APP_URL in: ${yourself.replace('https://…', url)}`
  writeFileSync(path, written)
  console.log(
    `Wrote APP_URL, the address emailed links name, into wrangler.jsonc's vars: ${url}. Commit that change. To serve the app at a domain of its own, set APP_URL there to that address instead.`
  )
  return undefined
}
