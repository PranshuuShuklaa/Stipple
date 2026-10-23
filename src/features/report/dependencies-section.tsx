'use client'

import { useEffect, useRef } from 'react'
import { animate, stagger } from 'animejs'
import type { Scan } from '@/lib/types/scan'
import { formatCount } from './step-headlines'
import { useOnceWhenVisible, useReducedMotion } from './use-once-when-visible'
import styles from './report.module.css'

/**
 * Dependencies: one chip per production dependency parsed from the
 * repo's root manifest, popping in with scale 0.6 to 1,
 * easeOutElastic(1, 0.7), stagger 70 ms from 500 ms — once, at 30%
 * visible (REFERENCE.md "Numbers").
 */
export function DependenciesSection({ scan }: { scan: Scan }) {
  const sectionRef = useRef<HTMLElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const visible = useOnceWhenVisible(sectionRef, 0.3)
  const reducedMotion = useReducedMotion()

  const chips = scan.dependencies

  useEffect(() => {
    if (!visible || reducedMotion) return
    const items = listRef.current?.querySelectorAll<HTMLLIElement>('li')
    if (!items || items.length === 0) return

    const tween = animate(items, {
      scale: [0.6, 1],
      duration: 800,
      ease: 'outElastic(1, 0.7)',
      delay: stagger(70, { start: 500 }),
    })

    return () => {
      tween.revert()
    }
  }, [visible, reducedMotion])

  return (
    <section id="dependencies" ref={sectionRef}>
      <h2 className={`type-section ${styles.sectionHeadline}`}>Dependencies.</h2>
      {chips.length === 0 ? (
        <p className={styles.sectionBody}>
          No dependency manifest at the repo root. Stipple reads package.json, requirements.txt,
          Cargo.toml and pom.xml, and lists only what the repo ships.
        </p>
      ) : (
        <p className={styles.sectionBody}>
          {formatCount(chips.length)} packages parsed from the repo root manifest.
        </p>
      )}
      {chips.length > 0 && (
        <ul className={styles.chips} ref={listRef}>
          {chips.map((dependency) => (
            <li key={dependency} className={styles.chip}>
              {dependency}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
