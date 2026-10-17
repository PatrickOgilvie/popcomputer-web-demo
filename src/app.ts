import { Hono } from 'hono'
import { Schema as S, Struct } from 'effect'
import { createTemplate, createVersion, setupWeb, vite } from '@popcomputer/web'
import { betterAuthSession } from '@popcomputer/web/auth'
import { routeBinding } from '@popcomputer/web/effect'
import { tableSchema } from '@popcomputer/web/schema'
import manifest from '../dist/client/manifest.json'
import { createAuth } from './auth'
import { createDb } from './db'
import { env, type Env } from './env'
import { pages } from './pages'
import { paths } from './paths'
import * as schema from './schema'
import { appTitle } from './title'

const entry = manifest['src/main.tsx']
const title = appTitle

// Browser chrome follows the page in both color schemes.
const head = [
  '<meta name="color-scheme" content="light dark">',
  '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
  '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff">',
  '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#09090b">',
].join('\n    ')

export const web = setupWeb(new Hono<Env>(), {
  version: createVersion(manifest),
  // In development the Worker runs inside Vite's dev server, so the pages load
  // from the page's own address, with hot reload; otherwise from the bundle
  // `bun run build` wrote.
  render: createTemplate((c) =>
    c.env.ENVIRONMENT === 'development'
      ? {
          title,
          scripts: [vite.script('/src/main.tsx', new URL(c.req.url).origin)],
          head: `${head}\n    ${vite.hmrHead(new URL(c.req.url).origin)}`,
        }
      : { title, scripts: [`/${entry.file}`], styles: (entry.css ?? []).map((file) => `/${file}`), head }
  ),
  database: (c) => createDb(c.env.DB),
  schema,
  // Each record a path names, and who may load it: another member's record
  // is the 404 a missing one is, so no action has to check.
  bindings: {
    project: routeBinding(schema.projects, { ownedBy: 'userId' }),
    publicProject: routeBinding(schema.projects, { publicWhen: { visibility: 'public' } }),
    session: routeBinding(schema.session, { ownedBy: 'userId' }),
  },
  pages,
  paths,
  auth: {
    client: (c, { db, backgroundTasks }) =>
      createAuth({
        db,
        secret: c.env.BETTER_AUTH_SECRET,
        baseURL: new URL(c.req.url).origin,
        advanced: { backgroundTasks },
        // The tests sign in with wrong passwords on purpose, and Better Auth
        // warns at each one.
        logger: { disabled: c.env.ENVIRONMENT === 'test' },
      }),
    session: betterAuthSession(tableSchema(schema.user), tableSchema(schema.session)),
    // Slows password guessing: the Rate Limiting binding wrangler.jsonc
    // declares, and Better Auth's rateLimit table for each account's failures.
    signInLimits: { limiter: 'SIGN_IN_LIMITER', table: schema.rateLimit },
    signInPath: paths.login,
    homePath: paths.dashboard,
    share: tableSchema(schema.user).mapFields(Struct.pick(['id', 'name', 'email'])),
  },
  flash: S.Struct({ success: S.String }),
  errors: { component: 'Errors/Error' },
  // Checks the Worker's vars and secrets against src/env.ts before it serves.
  env,
})

declare module '@popcomputer/web' {
  interface Register {
    web: typeof web
  }
}

export const { app, routes } = web
