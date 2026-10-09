import { Link } from '@inertiajs/react'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

export interface Breadcrumb {
  readonly label: string
  readonly href?: string
}

interface PageHeaderProps {
  readonly title: ReactNode
  readonly description?: ReactNode
  readonly breadcrumbs?: ReadonlyArray<Breadcrumb>
  readonly meta?: ReactNode
  readonly actions?: ReactNode
}

/** Page title block: optional breadcrumb trail, heading, summary, and actions. */
export default function PageHeader({
  title,
  description,
  breadcrumbs = [],
  meta,
  actions,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="mb-3">
            <ol className="flex min-w-0 items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
              {breadcrumbs.map((crumb, index) => (
                <li
                  key={`${crumb.href ?? 'current'}:${crumb.label}`}
                  className="flex min-w-0 items-center gap-1"
                >
                  {index > 0 ? (
                    <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
                  ) : null}
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="truncate rounded-sm hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-orange-600 dark:hover:text-white"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="truncate">
                      {crumb.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <h1 className="text-2xl font-semibold text-balance break-words sm:text-3xl">
          {title}
        </h1>
        {meta ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            {meta}
          </div>
        ) : null}
        {description ? (
          <p className="mt-2 max-w-2xl text-sm text-pretty text-zinc-600 sm:text-base dark:text-zinc-400">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  )
}
