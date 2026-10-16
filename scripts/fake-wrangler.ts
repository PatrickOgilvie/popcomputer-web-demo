import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** What the fake wrangler does for a command: the events it records, what it prints, and how it exits. */
export interface FakeCommand {
  readonly events?: ReadonlyArray<object>
  readonly stdout?: string
  readonly stderr?: string
  readonly status?: number
}

/** The fake itself, run by Bun: it answers from the plan and records each call. */
const FAKE = `import { appendFileSync, readFileSync } from 'node:fs'
const args = process.argv.slice(2)
appendFileSync(process.env.FAKE_WRANGLER_CALLS, JSON.stringify(args) + '\\n')
const plan = JSON.parse(readFileSync(process.env.FAKE_WRANGLER_PLAN, 'utf8'))
const command = plan[args.slice(0, 2).join(' ')] ?? plan[args[0]] ?? {}
for (const event of command.events ?? []) {
  appendFileSync(process.env.WRANGLER_OUTPUT_FILE_PATH, JSON.stringify(event) + '\\n')
}
process.stdout.write(command.stdout ?? '')
process.stderr.write(command.stderr ?? '')
process.exit(command.status ?? 0)
`

/**
 * Puts a fake `wrangler` first on PATH, so the scripts' wrangler commands
 * reach it and never Cloudflare. It answers each command from the plan, by
 * its first two words or else its first, and records the arguments of each.
 */
export function fakeWrangler(plan: Readonly<Record<string, FakeCommand>>) {
  const folder = mkdtempSync(join(tmpdir(), 'fake-wrangler-'))
  const calls = join(folder, 'calls.jsonl')
  writeFileSync(join(folder, 'plan.json'), JSON.stringify(plan))
  writeFileSync(join(folder, 'fake.ts'), FAKE)
  writeFileSync(join(folder, 'wrangler'), `#!/bin/sh\nexec bun "${join(folder, 'fake.ts')}" "$@"\n`)
  chmodSync(join(folder, 'wrangler'), 0o755)

  const saved = { PATH: process.env.PATH, PLAN: process.env.FAKE_WRANGLER_PLAN, CALLS: process.env.FAKE_WRANGLER_CALLS }
  process.env.PATH = `${folder}:${saved.PATH ?? ''}`
  process.env.FAKE_WRANGLER_PLAN = join(folder, 'plan.json')
  process.env.FAKE_WRANGLER_CALLS = calls

  return {
    /** The arguments of each call, in order. */
    calls(): ReadonlyArray<ReadonlyArray<string>> {
      if (!existsSync(calls)) return []
      return readFileSync(calls, 'utf8')
        .split('\n')
        .filter((line) => line !== '')
        .map((line): ReadonlyArray<string> => JSON.parse(line))
    },
    /** Puts PATH back and deletes the fake. */
    restore(): void {
      process.env.PATH = saved.PATH
      if (saved.PLAN === undefined) delete process.env.FAKE_WRANGLER_PLAN
      else process.env.FAKE_WRANGLER_PLAN = saved.PLAN
      if (saved.CALLS === undefined) delete process.env.FAKE_WRANGLER_CALLS
      else process.env.FAKE_WRANGLER_CALLS = saved.CALLS
      rmSync(folder, { recursive: true, force: true })
    },
  }
}
