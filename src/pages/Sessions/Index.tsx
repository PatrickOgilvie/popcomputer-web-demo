import { Head, useForm, usePage } from '@inertiajs/react'
import { Globe, Laptop, Smartphone } from 'lucide-react'
import { useState } from 'react'

import { buttonClassName } from '~/components/button'
import ConfirmationDialog from '~/components/ConfirmationDialog'
import { formatDate, formatDateTime, formatRelativeTime } from '~/components/format'
import Layout from '~/components/Layout'
import PageHeader from '~/components/PageHeader'
import { describeSessionDevice, type SessionDevice } from '~/components/session-device'
import UnderTheHood, { Guarantee } from '~/components/UnderTheHood'
import type { SessionSummary } from '~/presentation/session'
import type { PageProps } from '~/types'

type SessionsPageProps = PageProps<{
  readonly sessions: ReadonlyArray<SessionSummary>
}>

const deviceIcons = {
  desktop: Laptop,
  mobile: Smartphone,
  unknown: Globe,
} as const satisfies Record<SessionDevice['kind'], unknown>

/** Current device first, then the most recently active. */
function orderSessions(
  sessions: ReadonlyArray<SessionSummary>
): ReadonlyArray<SessionSummary> {
  return [...sessions].sort((left, right) => {
    if (left.isCurrent !== right.isCurrent) return left.isCurrent ? -1 : 1
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  })
}

function SessionRow({ session }: { readonly session: SessionSummary }) {
  const { post, processing, errors, clearErrors } = useForm({ sessionId: session.id })
  const [confirmsRevoke, setConfirmsRevoke] = useState(false)
  const device = describeSessionDevice(session.userAgent)
  const Icon = deviceIcons[device.kind]

  function handleRevoke() {
    post('/sessions/revoke', {
      preserveScroll: true,
      onSuccess: () => setConfirmsRevoke(false),
    })
  }

  return (
    <li className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
      <div className="flex min-w-0 flex-1 gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
          <Icon className="size-5 text-zinc-600 dark:text-zinc-300" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium">{device.label}</h2>
            {session.isCurrent ? (
              <span className="inline-flex h-6 items-center rounded-full bg-emerald-50 px-2.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-600/20 ring-inset dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
                This device
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-pretty text-zinc-600 tabular-nums dark:text-zinc-400">
            {session.isCurrent ? 'Active now' : (
              <>
                Active{' '}
                <time dateTime={session.updatedAt} title={formatDateTime(session.updatedAt)}>
                  {formatRelativeTime(session.updatedAt)}
                </time>
              </>
            )}
            <span aria-hidden="true"> · </span>
            Signed in <time dateTime={session.createdAt}>{formatDate(session.createdAt)}</time>
            <span aria-hidden="true"> · </span>
            Expires <time dateTime={session.expiresAt}>{formatDate(session.expiresAt)}</time>
          </p>
          <p className="mt-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {session.ipAddress ?? 'IP address unavailable'}
          </p>
        </div>
      </div>

      {session.isCurrent ? (
        <p className="hidden text-sm text-zinc-500 sm:block sm:w-44 sm:text-right dark:text-zinc-400">
          Use Sign out in the account menu
        </p>
      ) : (
        <ConfirmationDialog
          open={confirmsRevoke}
          onOpenChange={(open) => {
            if (open) clearErrors()
            setConfirmsRevoke(open)
          }}
          trigger={
            <button
              type="button"
              disabled={processing}
              aria-label={`Sign out ${device.label}, last active ${formatDateTime(session.updatedAt)}`}
              className={buttonClassName({ variant: 'secondary', size: 'sm', className: 'self-start sm:self-auto' })}
            >
              Sign out
            </button>
          }
          title={`Sign out ${device.label}?`}
          description="That device will need to sign in again to reach your account. Your current device stays signed in."
          confirmLabel="Sign out device"
          busyLabel="Signing out…"
          busy={processing}
          error={confirmsRevoke ? errors.sessionId : undefined}
          onConfirm={handleRevoke}
        />
      )}
    </li>
  )
}

/** Lists signed-in devices with server-owned, token-free revocation. */
export default function SessionsIndex() {
  const { sessions, errors } = usePage<SessionsPageProps>().props
  const ordered = orderSessions(sessions)
  const otherSessionCount = sessions.filter((session) => !session.isCurrent).length
  const { post, processing } = useForm({})
  const [confirmsRevokeOthers, setConfirmsRevokeOthers] = useState(false)
  const otherDevices = `${otherSessionCount} other ${otherSessionCount === 1 ? 'device' : 'devices'}`

  function handleRevokeOthers() {
    post('/sessions/revoke-others', {
      preserveScroll: true,
      onSuccess: () => setConfirmsRevokeOthers(false),
    })
  }

  return (
    <>
      <Head title="Signed-in devices" />
      <Layout>
        <PageHeader
          title="Signed-in devices"
          description="Every device signed in to your account. Sign out any you don’t recognize."
          actions={
            otherSessionCount > 0 ? (
              <ConfirmationDialog
                open={confirmsRevokeOthers}
                onOpenChange={setConfirmsRevokeOthers}
                trigger={
                  <button
                    type="button"
                    disabled={processing}
                    className={buttonClassName({ variant: 'dangerOutline' })}
                  >
                    Sign out {otherDevices}
                  </button>
                }
                title={`Sign out ${otherDevices}?`}
                description="They’ll need to sign in again. This device stays signed in."
                confirmLabel={`Sign out ${otherDevices}`}
                busyLabel="Signing out…"
                busy={processing}
                onConfirm={handleRevokeOthers}
              />
            ) : undefined
          }
        />

        {errors?.sessionId ? (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-4 py-3 text-sm text-pretty text-red-800 dark:bg-red-950/50 dark:text-red-300"
          >
            {errors.sessionId}
          </p>
        ) : null}

        <section
          aria-label="Signed-in devices"
          className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-zinc-50 px-5 py-2.5 text-xs font-medium text-zinc-500 sm:px-6 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            <span className="tabular-nums">
              {sessions.length} {sessions.length === 1 ? 'device' : 'devices'}
            </span>
            <span>Up to 5 are kept per account</span>
          </div>
          {ordered.length > 0 ? (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {ordered.map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
            </ul>
          ) : (
            <p className="px-6 py-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
              No active sessions were returned.
            </p>
          )}
        </section>

        <UnderTheHood route="GET /sessions" name="sessions.index">
          <Guarantee>
            Session tokens never reach the browser; signing a device out posts only
            its session ID.
          </Guarantee>
          <Guarantee>
            The database keeps at most five sessions per account; a sixth sign-in
            retires the oldest.
          </Guarantee>
          <Guarantee>
            Signing out revokes the session on the server before the cookie is
            cleared.
          </Guarantee>
        </UnderTheHood>
      </Layout>
    </>
  )
}
