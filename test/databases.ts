import { join } from 'node:path'
import { testD1 } from '@popcomputer/web/testing'

// Each test that asks gets a D1 database of its own, migrated and empty.
export const databases = testD1({ migrations: join(import.meta.dir, '../migrations') })
