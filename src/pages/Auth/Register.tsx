import { Head, useForm } from '@inertiajs/react'
import { useEffect, useRef } from 'react'
import type { FormEvent } from 'react'

import AuthShell from '~/components/AuthShell'
import { buttonClassName } from '~/components/button'
import TextField from '~/components/TextField'

export default function Register() {
  const { data, setData, post, processing, errors, clearErrors } = useForm({
    name: '',
    email: '',
    password: '',
  })
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (Object.keys(errors).length === 0) return
    formRef.current
      ?.querySelector<HTMLInputElement>('[aria-invalid="true"]')
      ?.focus()
  }, [errors])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    post('/register')
  }

  return (
    <>
      <Head title="Create account" />
      <AuthShell
        title="Create your account"
        description="It takes a few seconds. Everything you create stays in this demo’s database."
        alternatePrompt="Already have an account?"
        alternateHref="/login"
        alternateLabel="Sign in"
        route="POST /register"
        routeName="registration.store"
      >
        <form ref={formRef} className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <TextField
            id="name"
            name="name"
            type="text"
            label="Name"
            autoComplete="name"
            required
            value={data.name}
            error={errors.name}
            onChange={(event) => {
              setData('name', event.target.value)
              clearErrors('name')
            }}
          />
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
            autoComplete="new-password"
            required
            hint="At least 8 characters."
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
            <span aria-live="polite">
              {processing ? 'Creating account…' : 'Create account'}
            </span>
          </button>
        </form>
      </AuthShell>
    </>
  )
}
