'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Client-side route changes keep focus where it was, which strands
 * keyboard and screen-reader users on the old page. Move focus to the
 * main landmark after a real pathname change; skip the first render so a
 * normal page load still starts at the top (and the skip link stays first).
 */
export function RouteFocus() {
  const pathname = usePathname()
  const lastPathname = useRef<string | null>(null)

  useEffect(() => {
    if (lastPathname.current === null) {
      lastPathname.current = pathname
      return
    }
    if (lastPathname.current === pathname) return
    lastPathname.current = pathname
    document.getElementById('main-content')?.focus()
  }, [pathname])

  return null
}
