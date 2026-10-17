import { Head, Link, usePage } from '@inertiajs/react'
import type { WebPage } from '@popcomputer/web/react'

import { buttonClassName } from '~/components/button'
import { formatDate } from '~/components/format'
import Layout from '~/components/Layout'
import ProjectVisibilityBadge from '~/components/ProjectVisibilityBadge'
import UnderTheHood, { Guarantee } from '~/components/UnderTheHood'
import { paths } from '~/paths'

/** A public project, readable by anyone. */
const PublicProject: WebPage<'Projects/Public'> = ({ project }) => {
  const { auth } = usePage().props
  const isSignedIn = auth.user !== null

  return (
    <>
      <Head title={project.name}>
        <meta
          name="description"
          content={project.description?.trim() || `Public project: ${project.name}`}
        />
      </Head>
      <Layout>
        <article className="mx-auto flex w-full max-w-2xl flex-col gap-8 py-4 sm:py-8">
          <header className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
              <ProjectVisibilityBadge visibility="public" />
              <span>
                Updated{' '}
                <time dateTime={project.updatedAt}>{formatDate(project.updatedAt)}</time>
              </span>
            </div>
            <h1 className="text-3xl font-semibold text-balance break-words sm:text-4xl">
              {project.name}
            </h1>
          </header>

          {project.description?.trim() ? (
            <p className="text-base whitespace-pre-line text-pretty text-zinc-700 sm:text-lg dark:text-zinc-300">
              {project.description}
            </p>
          ) : (
            <p className="text-base text-zinc-500 dark:text-zinc-400">
              The owner hasn’t added a description.
            </p>
          )}

          <footer className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-pretty text-zinc-600 dark:text-zinc-400">
              {isSignedIn
                ? 'Shared from the popcomputer/web demo.'
                : 'Shared from the popcomputer/web demo. Create an account to publish your own.'}
            </p>
            <Link
              href={isSignedIn ? paths.projects : paths.register}
              className={buttonClassName({ variant: isSignedIn ? 'secondary' : 'primary' })}
            >
              {isSignedIn ? 'Your projects' : 'Create an account'}
            </Link>
          </footer>
        </article>

        <UnderTheHood route="GET /showcase/projects/{publicProject}" action="showPublicProject">
          <Guarantee>
            The route binds the project as <code>{'{publicProject}'}</code>, whose binding is{' '}
            <code>publicWhen: {"{ visibility: 'public' }"}</code>: a private one is the same 404 as a missing one.
          </Guarantee>
          <Guarantee>
            Rendered per request: a project made private or deleted disappears on the next visit.
          </Guarantee>
          <Guarantee>
            Only the name, description, and update time reach the browser: the page’s schema in <code>src/pages.ts</code> drops the rest.
          </Guarantee>
        </UnderTheHood>
      </Layout>
    </>
  )
}

export default PublicProject
