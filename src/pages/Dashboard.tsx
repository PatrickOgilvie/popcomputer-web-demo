import { Head, Link, usePage } from '@inertiajs/react'
import { ArrowRight, FolderPlus, Plus } from 'lucide-react'
import type { ReactNode } from 'react'

import { buttonClassName } from '~/components/button'
import EmptyState from '~/components/EmptyState'
import { formatDate, formatRelativeTime } from '~/components/format'
import Layout from '~/components/Layout'
import PageHeader from '~/components/PageHeader'
import ProjectVisibilityBadge from '~/components/ProjectVisibilityBadge'
import { describeSessionDevice } from '~/components/session-device'
import UnderTheHood, { Guarantee } from '~/components/UnderTheHood'
import type { DashboardProps } from '~/presentation/dashboard'
import type { PageProps } from '~/types'

const cardClassName =
  'rounded-lg border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900'

function StatCard({
  label,
  value,
  children,
  href,
  linkLabel,
}: {
  readonly label: string
  readonly value: number
  readonly children: ReactNode
  readonly href: string
  readonly linkLabel: string
}) {
  return (
    <section className={`${cardClassName} flex flex-col p-5`} aria-label={label}>
      <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{label}</h2>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      <div className="mt-3 flex-1 text-sm text-zinc-600 dark:text-zinc-400">{children}</div>
      <Link
        href={href}
        className="mt-4 inline-flex items-center gap-1 self-start rounded-sm text-sm font-medium text-zinc-950 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:text-white"
      >
        {linkLabel}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  )
}

/** Summarizes the signed-in account: recent projects, visibility, and devices. */
export default function Dashboard({ projects, sessions }: DashboardProps) {
  const { auth } = usePage<PageProps>().props
  const trimmedName = auth?.user?.name?.trim()
  const firstName =
    (trimmedName && trimmedName.split(/\s+/)[0]) || auth?.user?.email || 'there'
  const hasProjects = projects.total > 0
  const currentDevice = sessions.current
    ? describeSessionDevice(sessions.current.userAgent)
    : undefined
  const otherSessions = Math.max(sessions.active - (sessions.current ? 1 : 0), 0)
  const publicShare = hasProjects ? (projects.public / projects.total) * 100 : 0

  return (
    <>
      <Head title="Dashboard" />
      <Layout>
        <PageHeader
          title={`Good to see you, ${firstName}`}
          description={
            hasProjects
              ? 'Your projects and signed-in devices at a glance.'
              : 'Your account is ready. Start with a project — you can publish it whenever you like.'
          }
          actions={
            hasProjects ? (
              <Link href="/projects/create" className={buttonClassName()}>
                <Plus aria-hidden="true" />
                New project
              </Link>
            ) : undefined
          }
        />

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          <section
            aria-labelledby="recent-projects-title"
            className={`${cardClassName} lg:col-span-2`}
          >
            <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <h2 id="recent-projects-title" className="text-base font-semibold">
                Recently updated
              </h2>
              {hasProjects ? (
                <Link
                  href="/projects"
                  className="rounded-sm text-sm font-medium text-zinc-600 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-orange-600 dark:text-zinc-400 dark:hover:text-white"
                >
                  View all
                </Link>
              ) : null}
            </div>
            {hasProjects ? (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {projects.recent.map((project) => (
                  <li key={project.id} className="relative flex items-center gap-4 px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/projects/${encodeURIComponent(project.id)}`}
                        className="block truncate text-sm font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-orange-600"
                      >
                        {project.name}
                      </Link>
                      <p className="mt-1 truncate text-sm text-zinc-600 dark:text-zinc-400">
                        {project.description.trim() || 'No description'}
                      </p>
                    </div>
                    <ProjectVisibilityBadge visibility={project.visibility} />
                    <time
                      dateTime={project.updatedAt}
                      className="hidden w-28 shrink-0 text-right text-sm text-zinc-500 tabular-nums sm:block"
                    >
                      {formatRelativeTime(project.updatedAt)}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-5">
                <EmptyState
                  icon={FolderPlus}
                  title="No projects yet"
                  description="Projects are private until you publish them, and only your account can change them."
                  action={
                    <Link href="/projects/create" className={buttonClassName()}>
                      Create a project
                    </Link>
                  }
                />
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-1">
            <StatCard
              label="Projects"
              value={projects.total}
              href="/projects"
              linkLabel="Open projects"
            >
              {hasProjects ? (
                <>
                  <div
                    className="flex h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
                    aria-hidden="true"
                  >
                    <div className="bg-emerald-500" style={{ width: `${publicShare}%` }} />
                  </div>
                  <p className="mt-2 tabular-nums">
                    {projects.public} public · {projects.private} private
                  </p>
                </>
              ) : (
                <p>Nothing published yet.</p>
              )}
            </StatCard>

            <StatCard
              label="Signed-in devices"
              value={sessions.active}
              href="/sessions"
              linkLabel="Manage devices"
            >
              {currentDevice && sessions.current ? (
                <p className="text-pretty">
                  This device: {currentDevice.label}, signed in{' '}
                  {formatDate(sessions.current.createdAt)}.
                  {otherSessions > 0
                    ? ` ${otherSessions} other ${otherSessions === 1 ? 'device' : 'devices'}.`
                    : ' No other devices.'}
                </p>
              ) : (
                <p>Your current device couldn’t be identified.</p>
              )}
            </StatCard>
          </div>
        </div>

        <UnderTheHood route="GET /" name="dashboard.show">
          <Guarantee>
            One Effect loads your projects and devices concurrently through two
            application services.
          </Guarantee>
          <Guarantee>Every D1 read is scoped to your account’s owner ID.</Guarantee>
          <Guarantee>
            The response is sent with <code className="font-mono text-xs">Cache-Control: no-store</code>.
          </Guarantee>
        </UnderTheHood>
      </Layout>
    </>
  )
}
