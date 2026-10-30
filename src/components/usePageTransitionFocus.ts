import { usePage } from '@inertiajs/react'
import { useContext, useEffect, useRef, useState } from 'react'

import { PreviousPath } from '~/components/PageTransitions'

/** Moves focus and announces the destination after client-side page navigation. */
export default function usePageTransitionFocus() {
  const { url } = usePage()
  const previousPath = useContext(PreviousPath)
  const mainRef = useRef<HTMLElement>(null)
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    const currentPath = url.split(/[?#]/)[0] || '/'
    const pathChanged = previousPath?.current !== undefined && previousPath.current !== currentPath
    if (previousPath !== null) previousPath.current = currentPath

    if (!pathChanged) return

    const frame = requestAnimationFrame(() => {
      const main = mainRef.current
      if (!main) return

      main.focus({ preventScroll: true })
      const heading = main.querySelector<HTMLHeadingElement>('h1')
      const destination = heading?.textContent?.trim() || 'Page'
      setAnnouncement(`${destination} loaded`)
    })

    return () => cancelAnimationFrame(frame)
  }, [url, previousPath])

  return { mainRef, announcement } as const
}
