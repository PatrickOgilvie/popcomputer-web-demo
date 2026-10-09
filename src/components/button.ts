import { cn } from '~/components/cn'

const base =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:focus-visible:outline-orange-400 [&_svg]:size-4 [&_svg]:shrink-0'

const variants = {
  primary:
    'bg-zinc-950 text-white shadow-xs hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200',
  secondary:
    'border border-zinc-300 bg-white text-zinc-950 shadow-xs hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800',
  ghost:
    'text-zinc-700 hover:bg-zinc-200/60 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white',
  danger: 'bg-red-600 text-white shadow-xs hover:bg-red-700',
  dangerOutline:
    'border border-red-200 bg-white text-red-700 shadow-xs hover:bg-red-50 dark:border-red-900/60 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/40',
} as const

const sizes = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
} as const

/** Shared button appearance for buttons, Inertia links, and Base UI parts. */
export function buttonClassName({
  variant = 'primary',
  size = 'md',
  className,
}: {
  readonly variant?: keyof typeof variants
  readonly size?: keyof typeof sizes
  readonly className?: string
} = {}): string {
  return cn(base, variants[variant], sizes[size], className)
}
