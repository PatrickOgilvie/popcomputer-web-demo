import { spawn } from 'node:child_process'

/**
 * Runs the development servers through portless, and treats Ctrl-C as the way
 * to stop them. Portless exits 130 after an interrupt whatever its command
 * does, which `bun run` would report as `error: script "dev" exited with code 130`.
 */
let interrupted = false
process.on('SIGINT', () => {
  interrupted = true
})

const servers = spawn('portless', ['run', 'bun', 'scripts/dev.ts'], { stdio: 'inherit' })
servers.on('exit', (code) => {
  if (interrupted) console.log('Stopped.')
  process.exit(interrupted ? 0 : (code ?? 1))
})
