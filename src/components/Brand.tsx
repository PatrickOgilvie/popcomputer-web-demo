import { Link } from '@inertiajs/react'

import popcomputerLogo from '~/assets/popcomputer.png'
import { cn } from '~/components/cn'

/** Renders the popcomputer wordmark with the package suffix and links back to the dashboard. */
export default function Brand({ className }: { readonly className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600',
        className
      )}
      aria-label="popcomputer/web demo, dashboard"
    >
      <img src={popcomputerLogo} alt="" width={748} height={137} className="h-6 w-auto shrink-0" />
      <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400" translate="no">
        /web
      </span>
    </Link>
  )
}
