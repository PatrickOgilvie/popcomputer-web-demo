import { createAuth } from './auth'
import type { Database } from './db'
import type { Bindings } from './env'
import { projects } from './schema'

/** The member `bun run db:seed` creates, to sign in as locally. */
export const seedMember = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'at least twelve characters',
} as const

/**
 * What the local database holds after `bun run db:seed`: a member to sign in
 * as, with a private project and a public one. It runs in Bun on the local
 * D1 database once the migrations are applied, never on the deployed one,
 * and its inserts are typed by src/schema.ts like the app's own.
 */
export async function seed(db: Database, env: Bindings): Promise<void> {
  // Through Better Auth, as the sign-up form does, so the password signs in.
  const auth = createAuth({ db, secret: env.BETTER_AUTH_SECRET, baseURL: 'http://localhost' })
  const { user } = await auth.api.signUpEmail({ body: { ...seedMember } })

  await db.insert(projects).values([
    { userId: user.id, name: 'Apollo', description: 'A private project: only Ada sees it.' },
    { userId: user.id, name: 'Gemini', description: 'A public project: anyone with its link can read it.', visibility: 'public' },
  ])
  console.log(`Sign in as ${seedMember.email}, with the password "${seedMember.password}".`)
}
