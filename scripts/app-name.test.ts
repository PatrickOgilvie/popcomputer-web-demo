import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { cloudflareName, nameWranglerConfig, readDatabaseName, TEMPLATE_NAME } from './app-name'

const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')

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
    expect(named).toContain('"binding": "DB"')
  })

  test('keeps names the app already chose', () => {
    const chosen = nameWranglerConfig(config, 'first-name')

    expect(nameWranglerConfig(chosen, 'second-name')).toBe(chosen)
  })
})
