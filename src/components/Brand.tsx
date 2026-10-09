import { Link } from '@inertiajs/react'

import { cn } from '~/components/cn'

/** Renders the package identity and links back to the dashboard. */
export default function Brand({ className }: { readonly className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        'flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600',
        className
      )}
      aria-label="popcomputer/web demo, dashboard"
    >
      <svg
        viewBox="0 0 28 28"
        className="size-7 shrink-0"
        aria-hidden="true"
        focusable="false"
      >
        <rect width="28" height="28" rx="7" className="fill-zinc-950 dark:fill-white" />
        <path
          d="M11.5 20 16.5 8"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="stroke-white dark:stroke-zinc-950"
        />
        <circle cx="19.5" cy="18.5" r="2.5" className="fill-orange-500" />
      </svg>
      <span className="text-sm font-semibold" translate="no">
        popcomputer<span className="font-normal text-zinc-500 dark:text-zinc-400">/web</span>
      </span>
    </Link>
  )
}
