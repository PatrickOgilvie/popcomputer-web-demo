import { Head, Link } from '@inertiajs/react'
import type { WebErrorPage } from '@popcomputer/web/react'
import { Info } from 'lucide-react'

import { buttonClassName } from '~/components/button'
import Layout from '~/components/Layout'
import { paths } from '~/paths'

interface ErrorContent {
  readonly title: string
  readonly description: string
}

function getErrorContent(status: number): ErrorContent {
  switch (status) {
    case 401:
      return {
        title: 'Sign in to continue',
        description: 'Your session may have expired. Sign in again to keep going.',
      }
    case 403:
      return {
        title: 'You don’t have access',
        description: 'This page belongs to a different account or permission level.',
      }
    case 404:
      return {
        title: 'That page isn’t here',
        description: 'The address may be outdated, or the page may have moved.',
      }
    case 422:
      return {
        title: 'We couldn’t complete that request',
        description: 'Review the information you entered, then try once more.',
      }
    default:
      return {
        title: 'Something went wrong',
        description: 'The request didn’t finish, but you can safely try again.',
      }
  }
}

/** The page setupWeb's `errors.component` names: any error a visit meets, with a way back. */
const ErrorPage: WebErrorPage = ({ status, message, hint, auth }) => {
  const content = getErrorContent(status)
  const needsSignIn = status === 401 || auth.user === null

  return (
    <>
      <Head title={content.title} />
      <Layout>
        <section
          aria-labelledby="error-title"
          className="mx-auto flex w-full max-w-lg flex-col items-start py-12 sm:py-20"
        >
          <p className="font-mono text-sm text-zinc-500 tabular-nums dark:text-zinc-400">
            Error {status}
          </p>
          <h1 id="error-title" className="mt-3 text-3xl font-semibold text-balance">
            {content.title}
          </h1>
          <p className="mt-3 text-base text-pretty text-zinc-600 dark:text-zinc-400">
            {message || content.description}
          </p>

          {hint ? (
            <div
              role="note"
              className="mt-6 flex w-full gap-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <Info className="mt-0.5 size-4 shrink-0 text-zinc-500" aria-hidden="true" />
              <div>
                <p className="font-medium">Technical detail</p>
                <p className="mt-1 text-pretty text-zinc-600 dark:text-zinc-400">{hint}</p>
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-2">
            <Link href={needsSignIn ? paths.login : paths.dashboard} className={buttonClassName()}>
              {needsSignIn ? 'Sign in' : 'Back to dashboard'}
            </Link>
            <button
              type="button"
              className={buttonClassName({ variant: 'secondary' })}
              onClick={() => window.history.back()}
            >
              Go back
            </button>
          </div>
        </section>
      </Layout>
    </>
  )
}

export default ErrorPage
