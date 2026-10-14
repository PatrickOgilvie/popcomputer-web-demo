import { afterAll } from 'bun:test'
import { databases } from './databases'

// Once every test file is done: a Miniflare left running outlives `bun test`.
afterAll(() => databases.dispose())
