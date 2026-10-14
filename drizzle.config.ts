import { defineConfig } from 'drizzle-kit'

// `bun run db:generate` writes a migration for each change to src/schema.ts;
// wrangler applies them to D1 (`bun run db:migrate`) and the tests to theirs.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './migrations',
})
