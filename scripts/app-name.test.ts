import { describe, expect, test } from 'bun:test'

import { cloudflareName, nameWranglerConfig, readDatabaseName, TEMPLATE_NAME } from './app-name'

// The template's names as wrangler.jsonc ships them, whatever this app is called.
const config = `{
  "name": "${TEMPLATE_NAME}",
  "d1_databases": [
    { "binding": "DB", "database_name": "${TEMPLATE_NAME}-db", "migrations_dir": "migrations" }
  ],
  "ratelimits": [{ "name": "SIGN_IN_LIMITER", "namespace_id": "1001" }]
}`

describe('app name', () => {
  test('makes a Cloudflare name from the package name bun create chose', () => {
    expect(cloudflareName('my-app')).toBe('my-app')
    expect(cloudflareName('My Cool App!')).toBe('my-cool-app')
    expect(cloudflareName('@team/Shop_Front')).toBe('shop-front')
    expect(cloudflareName('x'.repeat(80))).toHaveLength(60)
    expect(cloudflareName('!!!')).toBe(TEMPLATE_NAME)
  })

  test("names the template's Worker and database after the app", () => {
    const named = nameWranglerConfig(config, 'my-app')

    expect(named).toContain('"name": "my-app"')
    expect(readDatabaseName(named)).toBe('my-app-db')
    expect(named).toContain('"name": "SIGN_IN_LIMITER"')
  })

  test('keeps names the app already chose', () => {
    const chosen = nameWranglerConfig(config, 'first-name')

    expect(nameWranglerConfig(chosen, 'second-name')).toBe(chosen)
  })
})
