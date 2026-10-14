import { drizzle } from 'drizzle-orm/d1'
import type { D1Database } from '@cloudflare/workers-types'
import * as schema from './schema'

export function createDb(database: D1Database) {
  return drizzle(database, { schema })
}

export type Database = ReturnType<typeof createDb>
