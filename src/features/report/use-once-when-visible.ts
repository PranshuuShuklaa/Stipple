'use client'

import { useEffect, useState } from 'react'

/** True once the element has crossed the visibility threshold. Fires once. */
export function useOnceWhenVisible(
  ref: React.RefObject<HTMLElement | null>,
  threshold: number,
): boolean {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (visible) return
    const element = ref.current
    if (!element) return
    if (typeof IntersectionObserver !== 'function') return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            observer.disconnect()
          }
        }
      },
      { threshold },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, threshold, visible])

  return visible
}

/** Reactive prefers-reduced-motion (SSR false; browsers only). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false
    if (typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      setReduced(query.matches)
    }
    query.addEventListener('change', update)
    return () => {
      query.removeEventListener('change', update)
    }
  }, [])

  return reduced
}
