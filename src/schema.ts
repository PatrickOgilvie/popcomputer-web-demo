import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { user } from './auth-schema'
import { Visibility } from './forms'

export * from './auth-schema'

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    visibility: text('visibility', { enum: Visibility.literals }).notNull().default('private'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index('projects_user_updated_idx').on(table.userId, table.updatedAt),
    // The database holds the same limits the forms check, whatever writes to it.
    check('projects_name_length', sql`length(${table.name}) BETWEEN 1 AND 100`),
    check('projects_description_length', sql`${table.description} IS NULL OR length(${table.description}) <= 500`),
    check('projects_visibility', sql`${table.visibility} IN ('private', 'public')`),
  ]
)
