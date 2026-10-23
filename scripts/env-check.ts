import { readFileSync } from 'node:fs'

import { env } from '../src/env'
import { capture, failure } from './command'
import { loginProblem } from './deploy'
import { devServerVars, readDevSession } from './dev'
import { EMAIL_OFF, readEmailSetup } from './email'
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
  const config = readFileSync('wrangler.jsonc', 'utf8')
  const wranglerVars = readWranglerVars(config)
  const email = readEmailSetup(config)
  const withEmail = (result: EnvReport): EnvReport =>
    typeof email === 'object' ? { ...result, problems: [...result.problems, email.problem] } : result
  if (!remote) {
    return report(
      withEmail(checkLocal(env, wranglerVars, readDevVars(), devServerVars(readDevSession({})))),
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
  const result = checkRemote(env, wranglerVars, secrets === 'no-worker' ? new Set() : secrets)
  if (email === 'off') console.log(EMAIL_OFF)
  for (const name of result.written) {
    console.log(`${name} isn't in wrangler.jsonc's vars yet; bun run deploy writes the app's workers.dev address there.`)
  }
  return report(
    withEmail(result),
    "Not ready to deploy: src/env.ts says the Worker needs what's below.",
    "Ready to deploy. Cloudflare never shows a secret's value, so this checks each one is set, not what it holds.",
    (name) => `${name} isn't on Cloudflare yet; bun run deploy uploads a new one.`
  )
}

if (import.meta.main) {
  process.exitCode = checkEnvironment(process.argv.includes('--remote'))
}
