import { readFileSync, writeFileSync } from 'node:fs'

import packageJson from '../package.json'

/** The names wrangler.jsonc ships with, before an app takes its own. */
export const TEMPLATE_NAME = 'popcomputer-web-demo'

/**
 * A Cloudflare Worker name from a package name: lowercase letters, digits and
 * dashes, short enough that the database's `-db` suffix still fits in 63.
 */
export function cloudflareName(packageName: string): string {
  const name = packageName
    .toLowerCase()
    .replace(/^@[^/]+\//, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '')
  return name === '' ? TEMPLATE_NAME : name
}

/**
 * Gives wrangler.jsonc the app's own Worker and database names, so two apps
 * made from the template never share one on Cloudflare. Only the template's
 * own names change; a name already chosen is kept.
 */
export function nameWranglerConfig(config: string, name: string): string {
  return config
    .replace(`"name": "${TEMPLATE_NAME}"`, `"name": "${name}"`)
    .replace(`"database_name": "${TEMPLATE_NAME}-db"`, `"database_name": "${name}-db"`)
}

/** The D1 database name wrangler.jsonc declares for the DB binding. */
export function readDatabaseName(config: string): string | undefined {
  return /"database_name":\s*"([^"]+)"/.exec(config)?.[1]
}

/** Names wrangler.jsonc after the app before anything reaches Cloudflare: `bun run deploy` runs it first. */
export function nameApp(path = 'wrangler.jsonc'): string | undefined {
  const name = cloudflareName(packageJson.name)
  if (name === TEMPLATE_NAME) return undefined

  const config = readFileSync(path, 'utf8')
  const named = nameWranglerConfig(config, name)
  if (named === config) return undefined

  writeFileSync(path, named)
  return name
}
