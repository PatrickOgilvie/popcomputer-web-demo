import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { readEmailSetup } from './email'

const config = (rest: string) => `{
  "name": "book-club",
  ${rest}
}`

describe('Cloudflare Email Sending', () => {
  test('is off in the template, which needs Workers Paid to turn it on', () => {
    expect(readEmailSetup(readFileSync('wrangler.jsonc', 'utf8'))).toBe('off')
  })

  test('is on with the send_email binding EMAIL and EMAIL_FROM in vars', () => {
    expect(
      readEmailSetup(config('"send_email": [{ "name": "EMAIL" }], // sends sign-up links\n  "vars": { "EMAIL_FROM": "hello@book-club.example" }'))
    ).toBe('on')
  })

  test('says what to add when wrangler.jsonc has one without the other', () => {
    expect(readEmailSetup(config('"send_email": [{ "name": "EMAIL" }], "vars": {}'))).toEqual({
      problem: expect.stringContaining('no EMAIL_FROM in vars'),
    })
    expect(readEmailSetup(config('"send_email": [{ "name": "MAILER" }], "vars": { "EMAIL_FROM": "hello@book-club.example" }'))).toEqual({
      problem: expect.stringContaining('no send_email binding'),
    })
  })
})
