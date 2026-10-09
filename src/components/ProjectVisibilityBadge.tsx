import { Globe, Lock } from 'lucide-react'

import { cn } from '~/components/cn'
import type { ProjectVisibility } from '~/domain/project'

interface ProjectVisibilityBadgeProps {
  readonly visibility: ProjectVisibility
  readonly className?: string
}

/** Displays a project's visibility with a consistent semantic status treatment. */
export default function ProjectVisibilityBadge({
  visibility,
  className,
}: ProjectVisibilityBadgeProps) {
  const isPublic = visibility === 'public'
  const Icon = isPublic ? Globe : Lock

  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ring-1 ring-inset',
        isPublic
          ? 'bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20'
          : 'bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-400/20',
        className
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {isPublic ? 'Public' : 'Private'}
    </span>
  )
}
