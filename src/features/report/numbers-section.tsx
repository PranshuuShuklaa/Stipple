'use client'

import { useEffect, useRef } from 'react'
import { animate } from 'animejs'
import type { Scan } from '@/lib/types/scan'
import { formatCount } from './step-headlines'
import { useOnceWhenVisible, useReducedMotion } from './use-once-when-visible'
import styles from './report.module.css'

interface Stat {
  label: string
  value: number | null
}

function statsOf(scan: Scan): Stat[] {
  const pending = scan.flags.statsPending
  return [
    { label: 'Commits', value: pending ? null : scan.commits },
    { label: 'Contributors', value: pending ? null : scan.contributors.length },
    { label: 'Packages', value: scan.dependencies.length },
  ]
}

/**
 * Numbers: three big counters (commits, contributors, packages) that
 * count up 1400 ms easeOutExpo, once at 30% visible. When GitHub is
 * still computing the stats the missing numbers say so in words — they
 * are never invented (scan.flags.statsPending).
 */
export function NumbersSection({ scan }: { scan: Scan }) {
  const sectionRef = useRef<HTMLElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const visible = useOnceWhenVisible(sectionRef, 0.3)
  const reducedMotion = useReducedMotion()

  const stats = statsOf(scan)

  useEffect(() => {
    if (!visible || reducedMotion) return
    const items = listRef.current?.querySelectorAll<HTMLLIElement>('[data-count-value]')
    if (!items || items.length === 0) return

    const tweens: { revert: () => unknown }[] = []
    for (const item of items) {
      const target = Number(item.dataset.countValue)
      if (!Number.isFinite(target)) continue
      const valueNode = item.querySelector('[data-count-number]')
      if (!valueNode) continue
      const counter = { value: 0 }
      tweens.push(
        animate(counter, {
          value: target,
          duration: 1400,
          ease: 'outExpo',
          onUpdate: () => {
            valueNode.textContent = formatCount(Math.round(counter.value))
          },
        }),
      )
    }

    return () => {
      for (const tween of tweens) {
        tween.revert()
      }
      // Leave every counter on its final value, never a frozen 0.
      for (const item of items) {
        const target = Number(item.dataset.countValue)
        const valueNode = item.querySelector('[data-count-number]')
        if (Number.isFinite(target) && valueNode) {
          valueNode.textContent = formatCount(target)
        }
      }
    }
  }, [visible, reducedMotion])

  return (
    <section id="numbers" ref={sectionRef}>
      <h2 className={`type-section ${styles.sectionHeadline}`}>Numbers.</h2>
      <ul className={styles.statsRow} ref={listRef}>
        {stats.map((stat) => (
          <li key={stat.label} data-count-value={stat.value ?? ''}>
            <p className={styles.statLabel}>{stat.label}</p>
            {stat.value === null ? (
              <>
                <p className={`${styles.statValue} ${styles.statValueEmpty}`}>—</p>
                <p className={styles.statNote}>GitHub is still computing this.</p>
              </>
            ) : (
              <p className={`${styles.statValue} tabular`}>{formatCount(stat.value)}</p>
            )}
          </li>
        ))}
      </ul>
      {scan.flags.statsPending && (
        <p className={styles.statNote}>
          The commit statistics come back as soon as GitHub finishes counting. Reload later to see them.
        </p>
      )}
    </section>
  )
}
