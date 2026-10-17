import { Head, Link, useForm } from '@inertiajs/react'
import { href } from '@popcomputer/web/paths'
import type { WebPage } from '@popcomputer/web/react'
import { Check, Copy, ExternalLink, Lock, Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'

import { buttonClassName } from '~/components/button'
import ConfirmationDialog from '~/components/ConfirmationDialog'
import { formatDateTime, formatRelativeTime } from '~/components/format'
import Layout from '~/components/Layout'
import PageHeader from '~/components/PageHeader'
import ProjectVisibilityBadge from '~/components/ProjectVisibilityBadge'
import UnderTheHood, { Guarantee } from '~/components/UnderTheHood'
import { paths } from '~/paths'

const cardClassName =
  'rounded-lg border border-zinc-200 bg-white p-5 shadow-xs sm:p-6 dark:border-zinc-800 dark:bg-zinc-900'

function PublicLinkCard({ path }: { readonly path: string }) {
  const url = new URL(path, window.location.origin).href
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeout = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timeout)
  }, [copied])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section aria-labelledby="public-link-title" className={cardClassName}>
      <h2 id="public-link-title" className="text-base font-semibold">
        Public link
      </h2>
      <p className="mt-1 text-sm text-pretty text-zinc-600 dark:text-zinc-400">
        Anyone with this link can read the name and description. Make the project
        private to turn the link off immediately.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <code className="block h-10 min-w-0 flex-1 truncate rounded-md border border-zinc-200 bg-zinc-50 px-3 font-mono text-sm/10 text-zinc-700 select-all dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
          {url}
        </code>
        <div className="flex gap-2">
          <button
            type="button"
            className={buttonClassName({ variant: 'secondary', className: 'flex-1' })}
            onClick={copyLink}
          >
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <Link
            href={path}
            className={buttonClassName({ variant: 'secondary', className: 'flex-1' })}
          >
            <ExternalLink aria-hidden="true" />
            Open
          </Link>
        </div>
      </div>
    </section>
  )
}

/** The member's project, with editing and a confirmed delete. */
const ShowProject: WebPage<'Projects/Show'> = ({ project }) => {
  const { delete: destroy, processing } = useForm({})
  const [confirmsDelete, setConfirmsDelete] = useState(false)
  const projectPath = href(paths.project, { project: project.id })
  const editPath = href(paths.editProject, { project: project.id })
  const showcasePath = href(paths.publicProject, { publicProject: project.id })
  const isPublic = project.visibility === 'public'

  function handleDelete() {
    destroy(projectPath, {
      onSuccess: () => setConfirmsDelete(false),
    })
  }

  return (
    <>
      <Head title={project.name} />
      <Layout>
        <PageHeader
          title={project.name}
          breadcrumbs={[
            { label: 'Projects', href: paths.projects },
            { label: project.name },
          ]}
          meta={
            <>
              <ProjectVisibilityBadge visibility={project.visibility} />
              <span>
                Updated{' '}
                <time dateTime={project.updatedAt} title={formatDateTime(project.updatedAt)}>
                  {formatRelativeTime(project.updatedAt)}
                </time>
              </span>
            </>
          }
          actions={
            <Link href={editPath} className={buttonClassName()}>
              <Pencil aria-hidden="true" />
              Edit
            </Link>
          }
        />

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
            <section aria-labelledby="description-title" className={cardClassName}>
              <h2 id="description-title" className="text-base font-semibold">
                Description
              </h2>
              {project.description?.trim() ? (
                <p className="mt-2 text-sm whitespace-pre-line text-pretty text-zinc-700 sm:text-base dark:text-zinc-300">
                  {project.description}
                </p>
              ) : (
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  No description yet.{' '}
                  <Link
                    href={editPath}
                    className="rounded-sm font-medium text-zinc-950 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-orange-600 dark:text-white"
                  >
                    Add one
                  </Link>
                </p>
              )}
            </section>

            {isPublic ? (
              <PublicLinkCard path={showcasePath} />
            ) : (
              <section aria-labelledby="private-title" className={cardClassName}>
                <h2 id="private-title" className="flex items-center gap-2 text-base font-semibold">
                  <Lock className="size-4 text-zinc-500" aria-hidden="true" />
                  Only you can see this project
                </h2>
                <p className="mt-1 text-sm text-pretty text-zinc-600 dark:text-zinc-400">
                  Make it public from{' '}
                  <Link
                    href={editPath}
                    className="rounded-sm font-medium text-zinc-950 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-orange-600 dark:text-white"
                  >
                    Edit
                  </Link>{' '}
                  to get a link you can share.
                </p>
              </section>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <section aria-labelledby="details-title" className={cardClassName}>
              <h2 id="details-title" className="text-base font-semibold">
                Details
              </h2>
              <dl className="mt-4 flex flex-col gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500 dark:text-zinc-400">Created</dt>
                  <dd className="text-right tabular-nums">
                    <time dateTime={project.createdAt}>{formatDateTime(project.createdAt)}</time>
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500 dark:text-zinc-400">Last updated</dt>
                  <dd className="text-right tabular-nums">
                    <time dateTime={project.updatedAt}>{formatDateTime(project.updatedAt)}</time>
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-zinc-500 dark:text-zinc-400">ID</dt>
                  <dd className="font-mono text-xs break-all text-zinc-700 select-all dark:text-zinc-300">
                    {project.id}
                  </dd>
                </div>
              </dl>
            </section>

            <section
              aria-labelledby="delete-title"
              className="rounded-lg border border-red-200 bg-white p-5 shadow-xs sm:p-6 dark:border-red-900/60 dark:bg-zinc-900"
            >
              <h2 id="delete-title" className="text-base font-semibold">
                Delete project
              </h2>
              <p className="mt-1 text-sm text-pretty text-zinc-600 dark:text-zinc-400">
                Removes it and its public page. This can’t be undone.
              </p>
              <ConfirmationDialog
                open={confirmsDelete}
                onOpenChange={setConfirmsDelete}
                trigger={
                  <button
                    type="button"
                    disabled={processing}
                    className={buttonClassName({ variant: 'dangerOutline', className: 'mt-4 w-full' })}
                  >
                    Delete project
                  </button>
                }
                title={`Delete “${project.name}”?`}
                description="The project and its public page are removed. This can’t be undone."
                confirmLabel="Delete project"
                busyLabel="Deleting…"
                busy={processing}
                onConfirm={handleDelete}
              />
            </section>
          </div>
        </div>

        <UnderTheHood route="GET /projects/{project}" action="showProject">
          <Guarantee>
            The route binds the project, <code>bound('project')</code>, so the action never queries for it.
          </Guarantee>
          <Guarantee>
            Its binding is <code>ownedBy: 'userId'</code>: another member’s project is the same 404 as a missing one,
            from the lookup’s own query.
          </Guarantee>
          <Guarantee>Deleting is scoped by the bound project and its owner.</Guarantee>
        </UnderTheHood>
      </Layout>
    </>
  )
}

export default ShowProject
