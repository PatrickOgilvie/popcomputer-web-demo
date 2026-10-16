import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { DEV_PID_FILE, readRunningDev } from './dev'

/**
 * Runs the development server through portless, and treats Ctrl-C, or
 * `bun run stop` from another terminal, as the way to stop it. Portless exits
 * 130 after an interrupt whatever its command does, which `bun run` would
 * report as `error: script "dev" exited with code 130`.
 */
const running = readRunningDev()
if (running !== undefined) {
  console.error('bun run dev is already running for this app. Run bun run stop to stop it, then start it again.')
  process.exit(1)
}
mkdirSync(dirname(DEV_PID_FILE), { recursive: true })
writeFileSync(DEV_PID_FILE, `${process.pid}\n`)

let interrupted = false
process.on('SIGINT', () => {
  interrupted = true
})

const server = spawn('portless', ['run', 'bun', 'scripts/dev.ts'], { stdio: 'inherit' })
server.on('exit', (code) => {
  rmSync(DEV_PID_FILE, { force: true })
  if (interrupted) console.log('Stopped.')
  process.exit(interrupted ? 0 : (code ?? 1))
})
