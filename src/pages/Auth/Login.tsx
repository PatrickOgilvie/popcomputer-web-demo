import { Head, useForm, usePage } from '@inertiajs/react'
import type { FormInput } from '@popcomputer/web/react'
import { useEffect, useRef } from 'react'
import type { FormEvent } from 'react'

import AuthShell from '~/components/AuthShell'
import { buttonClassName } from '~/components/button'
import TextField from '~/components/TextField'
import type { SignIn } from '~/forms'
import { paths } from '~/paths'

export default function Login() {
  const { data, setData, post, processing, errors, clearErrors } = useForm<FormInput<typeof SignIn>>({
    email: '',
    password: '',
  })
  const formRef = useRef<HTMLFormElement>(null)
  // An emailed link that expired, or was used already, lands here with ?error=.
  const linkExpired = new URL(usePage().url, 'http://localhost').searchParams.get('error') === 'link_expired'

  useEffect(() => {
    if (Object.keys(errors).length === 0) return
    formRef.current
      ?.querySelector<HTMLInputElement>('[aria-invalid="true"]')
      ?.focus()
  }, [errors])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    post(paths.login)
  }

  return (
    <>
      <Head title="Sign in" />
      <AuthShell
        title="Sign in"
        description="Pick up where you left off with your projects and devices."
        alternatePrompt="New here?"
        alternateHref={paths.register}
        alternateLabel="Create an account"
        route="POST /login"
        action="signIn"
      >
        {linkExpired ? (
          <p
            role="alert"
            className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-pretty text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
          >
            That link has expired, or was used already. Sign in: if your address isn’t confirmed yet, we’ll send you a
            new link.
          </p>
        ) : null}
        <form ref={formRef} className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <TextField
            id="email"
            name="email"
            type="email"
            label="Email"
            autoComplete="email"
            spellCheck={false}
            required
            value={data.email}
            error={errors.email}
            onChange={(event) => {
              setData('email', event.target.value)
              clearErrors('email')
            }}
          />
          <TextField
            id="password"
            name="password"
            type="password"
            label="Password"
            autoComplete="current-password"
            required
            value={data.password}
            error={errors.password}
            onChange={(event) => {
              setData('password', event.target.value)
              clearErrors('password')
            }}
          />
          <button
            type="submit"
            disabled={processing}
            aria-busy={processing}
            className={buttonClassName({ className: 'mt-1 w-full' })}
          >
            <span aria-live="polite">{processing ? 'Signing in…' : 'Sign in'}</span>
          </button>
        </form>
      </AuthShell>
    </>
  )
}
