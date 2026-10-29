'use client'

import { useRef } from 'react'
import type { Scan } from '@/lib/types/scan'
import { Odometer } from '@/components/ui/odometer'
import { formatCount } from './step-headlines'
import { RiseText } from './rise-text'
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
 * Numbers: three big counters (commits, contributors, packages) that roll
 * digit by digit like a mechanical counter, 1400 ms easeOutExpo, once at
 * 30% visible. When GitHub is still computing the stats the missing
 * numbers say so in words — they are never invented (scan.flags.statsPending).
 */
export function NumbersSection({ scan }: { scan: Scan }) {
  const sectionRef = useRef<HTMLElement | null>(null)
  const visible = useOnceWhenVisible(sectionRef, 0.3)
  const reducedMotion = useReducedMotion()

  const stats = statsOf(scan)

  return (
    <section id="numbers" aria-labelledby="numbers-heading" ref={sectionRef}>
      <RiseText id="numbers-heading" text="Numbers." className={`type-section ${styles.sectionHeadline}`} />
      <ul className={styles.statsRow}>
        {stats.map((stat) => (
          <li key={stat.label}>
            <p className={styles.statLabel}>{stat.label}</p>
            {stat.value === null ? (
              <>
                <p className={`${styles.statValue} ${styles.statValueEmpty}`}>—</p>
                <p className={styles.statNote}>GitHub is still computing this.</p>
              </>
            ) : (
              <p className={`${styles.statValue} tabular`}>
                <Odometer
                  text={formatCount(stat.value)}
                  start={visible}
                  animate={!reducedMotion}
                />
              </p>
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
