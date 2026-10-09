import { Link, usePage } from '@inertiajs/react'
import type { ReactNode } from 'react'

import AccountMenu from '~/components/AccountMenu'
import Brand from '~/components/Brand'
import { buttonClassName } from '~/components/button'
import usePageTransitionFocus from '~/components/usePageTransitionFocus'
import type { PageProps } from '~/types'

interface LayoutProps {
  readonly children: ReactNode
}

const primaryNavigation = [
  { label: 'Dashboard', href: '/' },
  { label: 'Projects', href: '/projects' },
  { label: 'Sessions', href: '/sessions' },
] as const

function isActivePath(currentPath: string, href: string): boolean {
  if (href === '/') return currentPath === href
  return currentPath === href || currentPath.startsWith(`${href}/`)
}

const navLinkClassName =
  'flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 aria-[current=page]:bg-zinc-100 aria-[current=page]:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white dark:aria-[current=page]:bg-zinc-800 dark:aria-[current=page]:text-white'

function PrimaryNavigation({
  currentPath,
  className,
}: {
  readonly currentPath: string
  readonly className?: string
}) {
  return (
    <nav aria-label="Primary" className={className}>
      <ul className="flex gap-1">
        {primaryNavigation.map((item) => (
          <li key={item.href} className="flex-1 sm:flex-none">
            <Link
              href={item.href}
              className={navLinkClassName}
              aria-current={isActivePath(currentPath, item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Application frame: account-aware header, page focus management, content. */
export default function Layout({ children }: LayoutProps) {
  const page = usePage<PageProps>()
  const user = page.props.auth?.user
  const currentPath = page.url.split(/[?#]/)[0] || '/'
  const trimmedName = user?.name?.trim()
  const displayName =
    trimmedName && trimmedName.length > 0 ? trimmedName : (user?.email ?? '')
  const { mainRef, announcement } = usePageTransitionFocus()

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-white px-3 py-2 text-sm font-medium shadow focus:not-sr-only focus:fixed focus:top-3 focus:left-3 dark:bg-zinc-900"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Brand />
          {user ? (
            <PrimaryNavigation currentPath={currentPath} className="hidden sm:block" />
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <AccountMenu displayName={displayName} email={user.email} />
            ) : (
              <>
                <Link href="/login" className={buttonClassName({ variant: 'ghost', size: 'sm' })}>
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className={buttonClassName({ size: 'sm', className: 'hidden sm:inline-flex' })}
                >
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
        {user ? (
          <PrimaryNavigation
            currentPath={currentPath}
            className="border-t border-zinc-200 px-4 py-2 sm:hidden dark:border-zinc-800"
          />
        ) : null}
      </header>

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>

      <main
        ref={mainRef}
        id="main-content"
        tabIndex={-1}
        className="flex-1 focus:outline-none"
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  )
}
