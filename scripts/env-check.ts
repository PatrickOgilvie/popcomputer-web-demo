import { readFileSync } from 'node:fs'

import { env } from '../src/env'
import { capture, failure } from './command'
import { loginProblem } from './deploy'
import { checkLocal, checkRemote, readDevVars, readSecretNames, readWranglerVars, type EnvReport } from './env'

/** Prints what a check found, and returns the exit code: 1 when something must be fixed first. */
function report(result: EnvReport, notReady: string, ready: string, generates: (name: string) => string): number {
  for (const name of result.generated) console.log(generates(name))
  if (result.problems.length === 0) {
    console.log(ready)
    return 0
  }
  console.error([notReady, ...result.problems.map((problem) => `- ${problem}`)].join('\n'))
  return 1
}

/**
 * Checks the vars and secrets src/env.ts declares: those `bun run dev` gives
 * the Worker, from `.dev.vars` and `wrangler.jsonc`'s vars, or with
 * `--remote` those a deploy gives it, from Cloudflare's secrets and
 * `wrangler.jsonc`'s vars.
 */
function checkEnvironment(remote: boolean): number {
  const wranglerVars = readWranglerVars(readFileSync('wrangler.jsonc', 'utf8'))
  if (!remote) {
    return report(
      checkLocal(env, wranglerVars, readDevVars()),
      "Not ready for bun run dev: src/env.ts says the Worker needs what's below.",
      'Ready for bun run dev.',
      (name) => `${name} isn't in .dev.vars yet; bun run dev writes a new one when it starts.`
    )
  }

  const login = loginProblem('bun run env:check --remote')
  if (login !== undefined) {
    console.error(login)
    return 1
  }
  const list = capture('wrangler', ['secret', 'list', '-c', 'wrangler.jsonc'])
  const secrets = readSecretNames(list)
  if (secrets === undefined) {
    console.error(failure(list, "Could not list the Worker's secrets; wrangler says why above."))
    return 1
  }
  return report(
    checkRemote(env, wranglerVars, secrets === 'no-worker' ? new Set() : secrets),
    "Not ready to deploy: src/env.ts says the Worker needs what's below.",
    "Ready to deploy. Cloudflare never shows a secret's value, so this checks each one is set, not what it holds.",
    (name) => `${name} isn't on Cloudflare yet; bun run deploy uploads a new one.`
  )
}

if (import.meta.main) {
  process.exitCode = checkEnvironment(process.argv.includes('--remote'))
}
