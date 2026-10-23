import { readWranglerVars } from './env'

/** What a check says while Cloudflare Email Sending is off, as the template leaves it. */
export const EMAIL_OFF =
  "Cloudflare Email Sending is off, so the Worker writes each sign-up's link to bun run logs, and nobody else can confirm an address and sign in. The README's \"Sending email\" says how to turn it on: it needs Workers Paid and the sending domain on Cloudflare."

/** Whether wrangler.jsonc declares a send_email binding named EMAIL. */
function bindsEmail(config: string): boolean {
  const parsed: unknown = Bun.JSONC.parse(config)
  if (typeof parsed !== 'object' || parsed === null || !('send_email' in parsed) || !Array.isArray(parsed.send_email)) return false
  const bindings: ReadonlyArray<unknown> = parsed.send_email
  return bindings.some((binding) => typeof binding === 'object' && binding !== null && 'name' in binding && binding.name === 'EMAIL')
}

/**
 * Whether wrangler.jsonc turns Cloudflare Email Sending on, which takes both
 * the send_email binding EMAIL and EMAIL_FROM in vars: 'on', 'off', or what
 * to add when it has one without the other.
 */
export function readEmailSetup(config: string): 'on' | 'off' | { readonly problem: string } {
  const binding = bindsEmail(config)
  const sender = Object.hasOwn(readWranglerVars(config), 'EMAIL_FROM')
  if (binding && sender) return 'on'
  if (!binding && !sender) return 'off'
  return {
    problem: binding
      ? 'wrangler.jsonc has the send_email binding EMAIL but no EMAIL_FROM in vars to send from. Add the address emails come from, on the domain you onboarded to Email Sending.'
      : 'wrangler.jsonc sets EMAIL_FROM but has no send_email binding to send with. Add "send_email": [{ "name": "EMAIL" }] to it.',
  }
}
