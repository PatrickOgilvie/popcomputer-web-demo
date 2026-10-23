import type { Bindings } from './env'
import { appTitle } from './title'

/** An email the app sends: plain text, to one address. */
export interface Email {
  readonly to: string
  readonly subject: string
  readonly text: string
}

/**
 * Sends an email with Cloudflare Email Sending once EMAIL_FROM names the
 * sender, through wrangler.jsonc's send_email binding, EMAIL. Sending needs
 * Workers Paid and the sender's domain on Cloudflare, so it's off until an
 * app turns it on, as the README's "Sending email" says. Until then each
 * email is written to the log: `bun run dev`'s terminal, or `bun run logs`.
 */
export async function sendEmail(env: Pick<Bindings, 'EMAIL' | 'EMAIL_FROM'>, email: Email): Promise<void> {
  if (env.EMAIL_FROM === undefined) {
    const heading = ['Not emailed: Cloudflare Email Sending is off, so here it is.', `To: ${email.to}`, `Subject: ${email.subject}`]
    console.log([...heading, '', email.text].join('\n'))
    return
  }
  if (env.EMAIL === undefined) {
    throw new Error('EMAIL_FROM is set, but wrangler.jsonc has no send_email binding named EMAIL to send with.')
  }
  const from = { email: env.EMAIL_FROM, name: appTitle }
  await env.EMAIL.send({ to: email.to, from, subject: email.subject, text: email.text })
}
