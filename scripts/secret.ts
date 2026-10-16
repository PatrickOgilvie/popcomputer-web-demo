import { execFileSync } from 'node:child_process'

import { env } from '../src/env'
import { secretNameProblem, secretValueProblem } from './env'

/**
 * Reads a line from the terminal without showing it, as a password prompt
 * does. Ctrl-C or Ctrl-D gives up.
 */
function readHidden(prompt: string): Promise<string | undefined> {
  const input = process.stdin
  return new Promise((resolve) => {
    let value = ''
    const finish = (result: string | undefined) => {
      input.off('data', onData)
      input.off('end', onEnd)
      input.setRawMode(false)
      input.pause()
      process.stdout.write('\n')
      resolve(result)
    }
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\r' || char === '\n') return finish(value)
        if (char === '\u0003' || char === '\u0004') return finish(undefined)
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1)
        else if (char >= ' ') value += char
      }
    }
    // A terminal closed before Enter gives up too.
    const onEnd = () => finish(undefined)
    process.stdout.write(prompt)
    input.setRawMode(true)
    input.resume()
    input.on('data', onData)
    input.on('end', onEnd)
  })
}

/** The value piped in, as an agent sends it, without the newline `echo` adds. */
async function readPiped(): Promise<string> {
  return (await Bun.stdin.text()).replace(/\r?\n$/, '')
}

/**
 * Sets a secret src/env.ts declares on Cloudflare, once its schema there
 * accepts the value: typed without showing it in a terminal, or piped in.
 * The value goes to wrangler's input, never its arguments or a file.
 */
async function setSecret(name: string | undefined): Promise<number> {
  const nameProblem = secretNameProblem(env, name)
  if (nameProblem !== undefined || name === undefined) {
    console.error(nameProblem)
    return 1
  }

  const value = process.stdin.isTTY ? await readHidden(`Value for ${name} (it won't show as you type): `) : await readPiped()
  if (value === undefined) return 1
  const valueProblem = secretValueProblem(env, name, value)
  if (valueProblem !== undefined) {
    console.error(`${valueProblem} Nothing was uploaded.`)
    return 1
  }

  try {
    execFileSync('wrangler', ['secret', 'put', name, '-c', 'wrangler.jsonc'], {
      input: value,
      stdio: ['pipe', 'inherit', 'inherit'],
    })
  } catch {
    console.error(`Could not set ${name}; wrangler says why above.`)
    return 1
  }
  console.log(`Set ${name} on Cloudflare. For bun run dev, put it in .dev.vars too.`)
  return 0
}

if (import.meta.main) {
  process.exitCode = await setSecret(process.argv[2])
}
