import { Head, useForm } from '@inertiajs/react'
import type { WebPage } from '@popcomputer/web/react'
import type { FormEvent } from 'react'

import AuthShell from '~/components/AuthShell'
import { Guarantee } from '~/components/UnderTheHood'
import { buttonClassName } from '~/components/button'
import { paths } from '~/paths'

// Only the button proves the address: a mail scanner that fetches the link
// sees this page and proves nothing.
const VerifyEmail: WebPage<'Auth/VerifyEmail'> = ({ token }) => {
  const { post, processing } = useForm({ token })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    post(paths.verifyEmail)
  }

  return (
    <>
      <Head title="Confirm your email address" />
      <AuthShell
        title="Confirm your email address"
        description="Confirm the address you signed up with, then sign in with your password."
        alternatePrompt="Didn’t sign up?"
        alternateHref={paths.login}
        alternateLabel="Leave it unconfirmed"
        route="POST /verify-email"
        action="verifyEmail"
        guarantees={
          <>
            <Guarantee>
              Opening the link only shows this page. The button’s POST proves the address, so a mail scanner
              that fetches the link proves nothing.
            </Guarantee>
            <Guarantee>The link proves its address within the hour, and signs nobody in.</Guarantee>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <button
            type="submit"
            disabled={processing}
            aria-busy={processing}
            className={buttonClassName({ className: 'w-full' })}
          >
            <span aria-live="polite">{processing ? 'Confirming…' : 'Confirm my email address'}</span>
          </button>
        </form>
      </AuthShell>
    </>
  )
}

export default VerifyEmail
