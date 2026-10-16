import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

import { checkEnv, defineEnv, describeEnvProblem, type EnvDeclaration, type EnvProblem } from '@popcomputer/web/env'

import { parseJson, type CommandResult } from './command'

/** Whether a value is the placeholder `.dev.vars.example` gives a secret, which secures nothing. */
export function isPlaceholder(value: string): boolean {
  return value.startsWith('replace-me')
}

/** The vars and secrets a `.dev.vars` file holds; none when there's no file. */
export function readDevVars(path = '.dev.vars'): Readonly<Record<string, string>> {
  if (!existsSync(path)) return {}
  const vars: Record<string, string> = {}
  for (const [name, value] of Object.entries(parseEnv(readFileSync(path, 'utf8')))) {
    if (value !== undefined) vars[name] = value
  }
  return vars
}

/** The vars `wrangler.jsonc` sets. */
export function readWranglerVars(config: string): Readonly<Record<string, unknown>> {
  const parsed: unknown = Bun.JSONC.parse(config)
  if (typeof parsed !== 'object' || parsed === null || !('vars' in parsed)) return {}
  const vars: unknown = parsed.vars
  return typeof vars === 'object' && vars !== null ? Object.fromEntries(Object.entries(vars)) : {}
}

/** What a check found: what to fix first, and which secrets a command will make. */
export interface EnvReport {
  /** Each var or secret the app can't run with, and what to do about it. */
  readonly problems: ReadonlyArray<string>
  /** Missing secrets src/env.ts can generate: `bun run dev` writes them locally, `bun run deploy` uploads them. */
  readonly generated: ReadonlyArray<string>
}

function secretNames(env: EnvDeclaration): ReadonlyArray<string> {
  return Object.entries(env.entries)
    .filter(([, entry]) => entry.kind === 'secret')
    .map(([name]) => name)
}

/** A declared secret in `wrangler.jsonc`'s vars is committed with the code, where anyone with the repository reads it. */
function secretsInVars(env: EnvDeclaration, wranglerVars: Readonly<Record<string, unknown>>): ReadonlyArray<string> {
  return secretNames(env)
    .filter((name) => Object.hasOwn(wranglerVars, name))
    .map(
      (name) =>
        `${name} is a secret, but wrangler.jsonc sets it in vars, where it's committed with the code. Remove it from vars, put it in .dev.vars, and set it on Cloudflare with bun run secret ${name}.`
    )
}

/**
 * Checks what `bun run dev` gives the Worker: `wrangler.jsonc`'s vars, with
 * `.dev.vars` over them. A secret still holding the example's placeholder is
 * missing, and a missing one src/env.ts can generate is left for
 * `bun run dev` to write.
 */
export function checkLocal(
  env: EnvDeclaration,
  wranglerVars: Readonly<Record<string, unknown>>,
  devVars: Readonly<Record<string, string>>
): EnvReport {
  const problems = [...secretsInVars(env, wranglerVars)]
  const generated: Array<string> = []
  const values: Record<string, unknown> = { ...wranglerVars, ...devVars }
  const placeholders = new Set(secretNames(env).filter((name) => isPlaceholder(devVars[name] ?? '')))
  for (const name of placeholders) delete values[name]

  for (const problem of checkEnv(env, values)) {
    const entry = env.entries[problem.name]
    if (problem.problem === 'missing' && entry?.kind === 'secret' && entry.generate !== undefined) {
      generated.push(problem.name)
    } else {
      problems.push(localAdvice(problem, placeholders.has(problem.name), Object.hasOwn(devVars, problem.name)))
    }
  }
  return { problems, generated }
}

function localAdvice(problem: EnvProblem, placeholder: boolean, inDevVars: boolean): string {
  const { name } = problem
  if (problem.problem === 'invalid') {
    return `${describeEnvProblem(problem)} Change it in ${inDevVars ? '.dev.vars' : "wrangler.jsonc's vars"}.`
  }
  if (problem.kind === 'variable') {
    return `The variable ${name} is missing. Set it in vars in wrangler.jsonc, or in .dev.vars for this computer only.`
  }
  return placeholder
    ? `The secret ${name} in .dev.vars still holds the example's placeholder. Put its value there instead.`
    : `The secret ${name} is missing from .dev.vars. Add a line ${name}=its value there.`
}

/**
 * Checks what a deploy gives the Worker: the secrets on Cloudflare, by name,
 * since Cloudflare never shows their values, and `wrangler.jsonc`'s vars. A
 * missing secret src/env.ts can generate is left for `bun run deploy` to
 * upload.
 */
export function checkRemote(
  env: EnvDeclaration,
  wranglerVars: Readonly<Record<string, unknown>>,
  uploaded: ReadonlySet<string>
): EnvReport {
  const problems = [...secretsInVars(env, wranglerVars)]
  const generated: Array<string> = []

  for (const [name, entry] of Object.entries(env.entries)) {
    if (entry.kind !== 'secret' || entry.optional || uploaded.has(name)) continue
    if (entry.generate !== undefined) generated.push(name)
    else problems.push(`The secret ${name} isn't set on Cloudflare. Run bun run secret ${name} to set it.`)
  }

  const variables = defineEnv(
    Object.fromEntries(Object.entries(env.entries).filter(([, entry]) => entry.kind === 'variable'))
  )
  for (const problem of checkEnv(variables, wranglerVars)) {
    problems.push(
      problem.problem === 'missing'
        ? `The variable ${problem.name} isn't in wrangler.jsonc's vars. Add it there.`
        : `${describeEnvProblem(problem)} Change it in wrangler.jsonc's vars.`
    )
  }
  return { problems, generated }
}

/** How src/env.ts makes a value for a secret, if it does. */
export function generatorOf(env: EnvDeclaration, name: string): (() => string) | undefined {
  const entry = env.entries[name]
  return entry?.kind === 'secret' ? entry.generate : undefined
}

/** Matches wrangler's error for a Worker that hasn't been deployed yet. */
const WORKER_NOT_FOUND = /Worker "[^"]+"(?: \(env: [^)]*\))? not found/

/**
 * The names of the secrets `wrangler secret list` shows, or `no-worker` before
 * the first deploy, when there's no Worker to hold any yet; any other failure
 * is unknown.
 */
export function readSecretNames(result: CommandResult): ReadonlySet<string> | 'no-worker' | undefined {
  if (result.status !== 0) return WORKER_NOT_FOUND.test(result.stderr) ? 'no-worker' : undefined
  const parsed = parseJson(result.stdout)
  if (!Array.isArray(parsed)) return undefined
  const secrets: ReadonlyArray<unknown> = parsed
  const names = new Set<string>()
  for (const secret of secrets) {
    if (typeof secret === 'object' && secret !== null && 'name' in secret && typeof secret.name === 'string') {
      names.add(secret.name)
    }
  }
  return names
}

/** Why `bun run secret NAME` can't set NAME, if it can't: only a secret src/env.ts declares is set this way. */
export function secretNameProblem(env: EnvDeclaration, name: string | undefined): string | undefined {
  const declared = secretNames(env).join(', ')
  if (name === undefined || name === '') {
    return `Name the secret to set: bun run secret NAME. src/env.ts declares ${declared}.`
  }
  const entry = env.entries[name]
  if (entry === undefined) {
    return `src/env.ts declares no ${name}. Declare it there with secret(...) first; its secrets are ${declared}.`
  }
  if (entry.kind === 'variable') return `${name} is a variable, not a secret: set it in vars in wrangler.jsonc.`
  return undefined
}

/** Why a value can't be uploaded as the secret, if it can't: its schema in src/env.ts refuses it. Never repeats the value. */
export function secretValueProblem(env: EnvDeclaration, name: string, value: string): string | undefined {
  const entry = env.entries[name]
  if (entry === undefined) return secretNameProblem(env, name)
  const [problem] = checkEnv(defineEnv({ [name]: { ...entry, optional: false } }), { [name]: value })
  if (problem === undefined) return undefined
  return problem.problem === 'missing' ? `The value for ${name} is empty.` : describeEnvProblem(problem)
}
