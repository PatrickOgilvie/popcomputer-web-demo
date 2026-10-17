import { Head, Link } from '@inertiajs/react'
import { href } from '@popcomputer/web/paths'
import type { PagePropsFor, WebPage } from '@popcomputer/web/react'
import { ExternalLink, FolderPlus, Plus } from 'lucide-react'

import { buttonClassName } from '~/components/button'
import EmptyState from '~/components/EmptyState'
import { formatDateTime, formatRelativeTime } from '~/components/format'
import Layout from '~/components/Layout'
import PageHeader from '~/components/PageHeader'
import ProjectVisibilityBadge from '~/components/ProjectVisibilityBadge'
import UnderTheHood, { Guarantee } from '~/components/UnderTheHood'
import { paths } from '~/paths'

function summarize(projects: PagePropsFor<'Projects/Index'>['projects']): string {
  const publicCount = projects.filter((project) => project.visibility === 'public').length
  const noun = projects.length === 1 ? 'project' : 'projects'
  return `${projects.length} ${noun} · ${publicCount} public`
}

/** Lists the signed-in member's projects with visibility and freshness. */
const ProjectsIndex: WebPage<'Projects/Index'> = ({ projects }) => {
  const newProjectLink = (
    <Link href={paths.newProject} className={buttonClassName()}>
      <Plus aria-hidden="true" />
      New project
    </Link>
  )

  return (
    <>
      <Head title="Projects" />
      <Layout>
        <PageHeader
          title="Projects"
          meta={projects.length > 0 ? <span className="tabular-nums">{summarize(projects)}</span> : undefined}
          description={
            projects.length > 0
              ? undefined
              : 'Projects you create live in D1 and are visible only to you until you publish them.'
          }
          actions={projects.length > 0 ? newProjectLink : undefined}
        />

        {projects.length === 0 ? (
          <EmptyState
            icon={FolderPlus}
            title="Create your first project"
            description="Give it a name, an optional description, and choose who can see it."
            action={
              <Link href={paths.newProject} className={buttonClassName()}>
                Create a project
              </Link>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
            <div
              className="hidden grid-cols-[minmax(0,1fr)_7rem_9rem_2.5rem] gap-4 border-b border-zinc-200 bg-zinc-50 px-5 py-2.5 text-xs font-medium text-zinc-500 sm:grid dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
              aria-hidden="true"
            >
              <span>Name</span>
              <span>Visibility</span>
              <span>Updated</span>
              <span />
            </div>
            <ul aria-label="Your projects" className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {projects.map((project) => (
                <li
                  key={project.id}
                  className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-4 hover:bg-zinc-50 sm:grid-cols-[minmax(0,1fr)_7rem_9rem_2.5rem] dark:hover:bg-zinc-800/50"
                >
                  <div className="min-w-0">
                    <Link
                      href={href(paths.project, { project: project.id })}
                      className="block truncate text-sm font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-orange-600"
                    >
                      {project.name}
                    </Link>
                    <p className="mt-1 line-clamp-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {project.description?.trim() || 'No description'}
                    </p>
                  </div>
                  <div className="row-start-2 flex items-center gap-3 sm:row-start-auto">
                    <ProjectVisibilityBadge visibility={project.visibility} />
                  </div>
                  <time
                    dateTime={project.updatedAt}
                    title={formatDateTime(project.updatedAt)}
                    className="row-start-2 text-sm text-zinc-500 tabular-nums sm:row-start-auto dark:text-zinc-400"
                  >
                    {formatRelativeTime(project.updatedAt)}
                  </time>
                  <div className="col-start-2 row-start-1 flex justify-end sm:col-start-auto sm:row-start-auto">
                    {project.visibility === 'public' ? (
                      <Link
                        href={href(paths.publicProject, { publicProject: project.id })}
                        className={buttonClassName({ variant: 'ghost', size: 'sm', className: 'relative size-8 px-0' })}
                        aria-label={`Open the public page for ${project.name}`}
                      >
                        <ExternalLink aria-hidden="true" />
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <UnderTheHood route="GET /projects" action="listProjects">
          <Guarantee>A signed-out visitor is sent to sign in before anything is read.</Guarantee>
          <Guarantee>
            The query reads exactly the columns the page's schema names, with <code>columnsOf</code>.
          </Guarantee>
          <Guarantee>The props are encoded through that schema: nothing else reaches the browser.</Guarantee>
        </UnderTheHood>
      </Layout>
    </>
  )
}

export default ProjectsIndex
