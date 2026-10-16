import { rmSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

import { DEV_PID_FILE, processTree, readRunningDev } from './dev'

/** How long the server has to stop after an interrupt before it is ended. */
const STOP_TIMEOUT_MS = 15_000

function signal(pids: ReadonlyArray<number>, name: NodeJS.Signals): void {
  for (const pid of pids) {
    try {
      process.kill(pid, name)
    } catch {
      // It stopped already.
    }
  }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Stops a `bun run dev` started in another terminal or in the background, the
 * way Ctrl-C does: an interrupt to it and every process it started.
 */
async function stopDevelopmentServer(): Promise<number> {
  const pid = readRunningDev()
  if (pid === undefined) {
    rmSync(DEV_PID_FILE, { force: true })
    console.log("bun run dev isn't running for this app.")
    return 0
  }

  const tree = processTree(pid)
  signal(tree, 'SIGINT')
  for (let waited = 0; waited < STOP_TIMEOUT_MS; waited += 200) {
    if (!isRunning(pid)) {
      console.log('Stopped bun run dev.')
      return 0
    }
    await sleep(200)
  }

  signal(tree, 'SIGTERM')
  rmSync(DEV_PID_FILE, { force: true })
  console.log("bun run dev didn't stop after an interrupt, so it was ended.")
  return 0
}

if (import.meta.main) {
  process.exitCode = await stopDevelopmentServer()
}
