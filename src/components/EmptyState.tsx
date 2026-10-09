import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  readonly icon: LucideIcon
  readonly title: string
  readonly description: ReactNode
  /** The single next action for this state. */
  readonly action: ReactNode
  readonly headingLevel?: 'h2' | 'h3'
}

/** Explains an empty collection and offers exactly one way forward. */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  headingLevel: Heading = 'h2',
}: EmptyStateProps) {
  return (
    <section className="flex flex-col items-center rounded-lg border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
      <span className="flex size-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
        <Icon className="size-5 text-zinc-600 dark:text-zinc-300" aria-hidden="true" />
      </span>
      <Heading className="mt-4 text-base font-semibold text-balance">{title}</Heading>
      <p className="mt-1 max-w-sm text-sm text-pretty text-zinc-600 dark:text-zinc-400">
        {description}
      </p>
      <div className="mt-6">{action}</div>
    </section>
  )
}
