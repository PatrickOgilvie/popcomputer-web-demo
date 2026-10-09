import { Menu } from '@base-ui/react/menu'
import { Link, router } from '@inertiajs/react'
import { ChevronDown, LogOut, MonitorSmartphone } from 'lucide-react'

interface AccountMenuProps {
  readonly displayName: string
  readonly email: string
}

const itemClassName =
  'flex h-9 cursor-default items-center gap-2 rounded-md px-2 text-sm text-zinc-700 outline-none select-none data-highlighted:bg-zinc-100 data-highlighted:text-zinc-950 dark:text-zinc-300 dark:data-highlighted:bg-zinc-800 dark:data-highlighted:text-white [&_svg]:size-4 [&_svg]:text-zinc-500'

/** Account summary with session management and sign-out. */
export default function AccountMenu({ displayName, email }: AccountMenuProps) {
  const initial = displayName.slice(0, 1).toUpperCase() || '?'

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Account menu for ${displayName}`}
        className="flex h-9 items-center gap-2 rounded-full py-1 pr-2 pl-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 data-popup-open:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:data-popup-open:bg-zinc-800"
      >
        <span
          className="flex size-7 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100"
          aria-hidden="true"
        >
          {initial}
        </span>
        <span className="hidden max-w-40 truncate sm:block">{displayName}</span>
        <ChevronDown className="size-4 text-zinc-500" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="end" className="z-50 outline-none">
          <Menu.Popup className="w-64 rounded-lg border border-zinc-200 bg-white p-1 text-zinc-950 shadow-lg outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50">
            <div className="px-2 py-2">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">{email}</p>
            </div>
            <Menu.Separator className="my-1 h-px bg-zinc-200 dark:bg-zinc-800" />
            <Menu.LinkItem
              className={itemClassName}
              closeOnClick
              render={<Link href="/sessions" />}
            >
              <MonitorSmartphone aria-hidden="true" />
              Signed-in devices
            </Menu.LinkItem>
            <Menu.Item className={itemClassName} onClick={() => router.post('/logout')}>
              <LogOut aria-hidden="true" />
              Sign out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
