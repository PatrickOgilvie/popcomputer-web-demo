import { Head } from '@inertiajs/react'
import type { WebPage } from '@popcomputer/web/react'

import AuthShell from '~/components/AuthShell'
import { paths } from '~/paths'

const codeClassName = 'font-mono text-xs'

const CheckEmail: WebPage<'Auth/CheckEmail'> = ({ sendsEmail }) => (
  <>
    <Head title="Check your inbox" />
    <AuthShell
      title="Check your inbox"
      description={
        sendsEmail
          ? 'We’ve emailed you a link to confirm your address. Follow it within the hour, then sign in.'
          : 'Follow the link that confirms your address within the hour, then sign in.'
      }
      alternatePrompt="Confirmed it already?"
      alternateHref={paths.login}
      alternateLabel="Sign in"
      route="POST /register"
      action="signUp"
    >
      <div className="flex flex-col gap-3 text-sm text-pretty text-zinc-600 dark:text-zinc-400">
        {sendsEmail ? (
          <p>Nothing there? Look in your spam folder.</p>
        ) : (
          <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            This app doesn’t send email yet, so the link is in its log: the terminal running{' '}
            <code className={codeClassName}>bun run dev</code>, or <code className={codeClassName}>bun run logs</code> once
            it’s deployed. The README’s “Sending email” says how to turn sending on.
          </p>
        )}
        <p>Once the hour has passed, sign in with your password and we’ll send you a new link.</p>
      </div>
    </AuthShell>
  </>
)

export default CheckEmail
