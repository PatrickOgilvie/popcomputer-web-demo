import { Code } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '~/components/cn'

interface UnderTheHoodProps {
  /** Method and path, for example `GET /projects`. */
  readonly route: string
  /** Name registered for the route in `src/routes.ts`. */
  readonly name: string
  /** Lists guarantees in one column for narrow placements. */
  readonly compact?: boolean
  readonly children: ReactNode
}

/** States which framework guarantees the current page demonstrates. */
export default function UnderTheHood({
  route,
  name,
  compact = false,
  children,
}: UnderTheHoodProps) {
  return (
    <aside
      aria-label="Under the hood"
      className="rounded-lg border border-zinc-200 bg-zinc-100/70 p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-900/60"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Code className="size-4 text-zinc-500" aria-hidden="true" />
          Under the hood
        </p>
        <p className="flex flex-wrap items-center gap-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
          <span>{route}</span>
          <span aria-hidden="true">·</span>
          <span>{name}</span>
        </p>
      </div>
      <ul
        className={cn(
          'mt-3 grid gap-2 text-sm text-pretty text-zinc-600 dark:text-zinc-400',
          !compact && 'sm:grid-cols-2 lg:grid-cols-3'
        )}
      >
        {children}
      </ul>
    </aside>
  )
}

/** One guarantee listed inside {@link UnderTheHood}. */
export function Guarantee({ children }: { readonly children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span
        className="mt-2 size-1.5 shrink-0 rounded-full bg-zinc-400 dark:bg-zinc-600"
        aria-hidden="true"
      />
      <span>{children}</span>
    </li>
  )
}
