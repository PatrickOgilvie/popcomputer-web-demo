import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'

/** What a command printed, and how it exited. */
export interface CommandResult {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
}

/** Runs a command without a terminal, so it asks nothing, and keeps what it prints. */
export function capture(command: string, args: ReadonlyArray<string>): CommandResult {
  const result = spawnSync(command, [...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  // A command that couldn't start at all has only its error to say why.
  const stderr = `${result.stderr ?? ''}${result.error === undefined ? '' : result.error.message}`
  return { status: result.status, stdout: result.stdout ?? '', stderr }
}

/** A captured command's own error output, then what failed. */
export function failure(result: CommandResult, what: string): string {
  return [result.stderr.trim(), what].filter((text) => text !== '').join('\n')
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * Runs a step where it reports itself, in this terminal, and says what failed
 * if it did.
 */
export function runStep(command: string, args: ReadonlyArray<string>, failed: string): string | undefined {
  try {
    execFileSync(command, [...args], { stdio: 'inherit' })
    return undefined
  } catch {
    return failed
  }
}

/** A wrangler command run in this terminal, and the events it recorded about what it did. */
export interface WranglerRun {
  readonly ok: boolean
  readonly events: ReadonlyArray<object>
}

/** The events in the file WRANGLER_OUTPUT_FILE_PATH names: a line of JSON for each. */
export function readEvents(output: string): ReadonlyArray<object> {
  const events: Array<object> = []
  for (const line of output.split('\n')) {
    const event = parseJson(line)
    if (typeof event === 'object' && event !== null) events.push(event)
  }
  return events
}

/**
 * Runs wrangler where it reports itself, in this terminal, and keeps the
 * events it writes to WRANGLER_OUTPUT_FILE_PATH: what it uploaded, deployed,
 * or why it failed.
 */
export function runWrangler(args: ReadonlyArray<string>): WranglerRun {
  const folder = mkdtempSync(join(tmpdir(), 'wrangler-output-'))
  try {
    const outputFile = join(folder, 'output.json')
    let ok = true
    try {
      execFileSync('wrangler', [...args], {
        stdio: 'inherit',
        env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: outputFile },
      })
    } catch {
      ok = false
    }
    return { ok, events: existsSync(outputFile) ? readEvents(readFileSync(outputFile, 'utf8')) : [] }
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

/** The message of the `command-failed` event wrangler records when a command fails. */
export function readFailure(events: ReadonlyArray<object>): string | undefined {
  for (const event of events) {
    if (!('type' in event) || event.type !== 'command-failed') continue
    if ('message' in event && typeof event.message === 'string') return event.message
  }
  return undefined
}

/** Whether there's someone to ask: a terminal on both input and output. */
export function canAsk(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true
}

/** Asks a yes-or-no question in the terminal; only "y" or "yes" is yes. */
export async function askYesNo(question: string): Promise<boolean> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await prompt.question(`${question} (y/N) `)
    return /^\s*y(es)?\s*$/i.test(answer)
  } finally {
    prompt.close()
  }
}
