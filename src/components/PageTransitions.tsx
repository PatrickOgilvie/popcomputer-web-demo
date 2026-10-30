import { createContext, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'

/**
 * The path of the page the tab showed last. Each page renders its own layout,
 * which mounts again on every visit, so the path lives here, at the app's
 * root, which stays mounted for as long as the tab does.
 */
export const PreviousPath = createContext<RefObject<string | undefined> | null>(null)

export default function PageTransitions({ children }: { readonly children: ReactNode }) {
  const previousPath = useRef<string | undefined>(undefined)

  return <PreviousPath.Provider value={previousPath}>{children}</PreviousPath.Provider>
}
