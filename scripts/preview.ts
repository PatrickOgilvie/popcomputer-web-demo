import { readFileSync } from 'node:fs'

import { env } from '../src/env'
import { nameApp } from './app-name'
import { readDatabaseId } from './cloudflare-database'
import { capture, failure, runStep } from './command'
import { loginProblem, schemaProblem } from './deploy'
import { checkRemote, readSecretNames, readWranglerVars } from './env'
import { listUnappliedMigrations } from './migrations'
import { checkAnswers, READINESS_PATH, shortVersion, turnsOffVersionUrls, uploadVersion } from './versions'

const RERUN = 'bun run preview'

/** Why there's nothing to preview beside yet. */
const NOT_DEPLOYED =
  "The app isn't deployed yet, and a preview runs beside the live app, on its database and secrets. Run bun run deploy first, then bun run preview."

/**
 * Whether the app is on Cloudflare with what a preview needs: its database,
 * and every var and secret src/env.ts says the Worker needs, since a preview
 * runs on the live ones.
 */
function deployedProblem(): string | undefined {
  const config = readFileSync('wrangler.jsonc', 'utf8')
  if (readDatabaseId(config) === undefined) return NOT_DEPLOYED
  const list = capture('wrangler', ['secret', 'list', '-c', 'wrangler.jsonc'])
  const secrets = readSecretNames(list)
  if (secrets === undefined) return failure(list, "Could not list the Worker's secrets; wrangler says why above.")
  if (secrets === 'no-worker') return NOT_DEPLOYED

  const { problems, generated } = checkRemote(env, readWranglerVars(config), secrets)
  const missing = [
    ...problems,
    ...generated.map((name) => `The secret ${name} isn't on Cloudflare yet. Run bun run deploy, which makes one.`),
  ]
  if (missing.length === 0) return undefined
  return [
    "Not previewing: the version would start without what src/env.ts says it needs, since it runs on the live app's secrets.",
    ...missing.map((problem) => `- ${problem}`),
    `Then run ${RERUN} again.`,
  ].join('\n')
}

/**
 * Says which migrations the live database hasn't had yet. A preview shares
 * that database, so this never applies them: only a deploy does.
 */
function noteUnappliedMigrations(): void {
  const listed = listUnappliedMigrations('remote')
  if (!('unapplied' in listed) || listed.unapplied.length === 0) return
  const count = listed.unapplied.length
  const them = count === 1 ? 'it' : 'them'
  console.log(
    `\nThe database on Cloudflare hasn't had ${count === 1 ? '1 migration' : `${count} migrations`} yet (${listed.unapplied.join(', ')}). A preview runs on the live database, so bun run preview doesn't apply ${them}: pages that need ${them} fail on the preview until bun run deploy applies ${them}.`
  )
}

/**
 * Uploads the build as a new version of the Worker without sending it any
 * traffic, checks it answers at its Version URL, and prints that address to
 * share. The live app is unchanged.
 */
async function preview(): Promise<number> {
  const name = nameApp()
  if (name !== undefined) console.log(`Named the Worker ${name} and its database ${name}-db in wrangler.jsonc.`)

  const before = [
    () => schemaProblem(RERUN),
    () => loginProblem(RERUN),
    deployedProblem,
    () => runStep('bun', ['run', 'build'], 'The build failed; it says why above.'),
  ]
  for (const step of before) {
    const problem = step()
    if (problem !== undefined) {
      console.error(problem)
      return 1
    }
  }
  noteUnappliedMigrations()

  const upload = uploadVersion(RERUN)
  if (upload.kind !== 'uploaded') {
    console.error(upload.kind === 'no-worker' ? NOT_DEPLOYED : 'Could not upload the preview; wrangler says why above.')
    return 1
  }
  const { versionId, previewUrl } = upload.version
  const version = `version ${shortVersion(versionId)}`
  if (previewUrl === undefined) {
    const fix = turnsOffVersionUrls(readFileSync('wrangler.jsonc', 'utf8'))
      ? 'preview_urls is false in wrangler.jsonc: set it to true, run bun run deploy to turn Version URLs on, then bun run preview again.'
      : 'run bun run deploy, which turns Version URLs on for the Worker, then bun run preview again.'
    console.error(`Uploaded ${version}, but Cloudflare gave it no Version URL to open it at. To have one, ${fix}`)
    return 1
  }

  const page = `${previewUrl}${READINESS_PATH}`
  console.log(`\nChecking ${version} answers at ${page}, for up to 30 seconds...`)
  const answer = await checkAnswers(page)
  if (answer.kind === 'failed') {
    console.error(`The preview is at ${previewUrl}, but ${page} didn't answer: ${answer.reason}. Fix it, then run bun run preview again.`)
    return 1
  }
  console.log(`\nPreview, not live: ${previewUrl}`)
  console.log(
    answer.kind === 'ready'
      ? `It answers there, as ${version}.`
      : "Cloudflare Access asks visitors to sign in there, so bun run preview couldn't check it answers."
  )
  console.log(
    "It runs on the live app's database and secrets, so what anyone does on it, they do to the live app's data. Share the address for feedback; bun run deploy makes this code live."
  )
  return 0
}

if (import.meta.main) {
  process.exitCode = await preview()
}
