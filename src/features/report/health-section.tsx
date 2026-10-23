'use client'

import { useEffect, useRef } from 'react'
import { animate, stagger } from 'animejs'
import type { Scan } from '@/lib/types/scan'
import { formatCount } from './step-headlines'
import { useOnceWhenVisible, useReducedMotion } from './use-once-when-visible'
import styles from './report.module.css'

/** 2 * PI * 54, the offset base REFERENCE.md fixes at 339.3. */
const RING_CIRCUMFERENCE = 339.3

/**
 * Health: SVG ring that draws itself (1600 ms inOutExpo), a score that
 * counts up in sync (1400 ms outExpo) and checklist rows that resolve
 * one by one (REFERENCE.md "Sections under the story"). Plays once at
 * 30% visible; reduced motion keeps the drawn state the markup already
 * carries. The score number counts with the ring, never faked in SSR:
 * the markup renders the final value pre-animation.
 */
export function HealthSection({ scan }: { scan: Scan }) {
  const sectionRef = useRef<HTMLElement | null>(null)
  const ringRef = useRef<SVGCircleElement | null>(null)
  const scoreRef = useRef<HTMLSpanElement | null>(null)
  const rowsRef = useRef<HTMLUListElement | null>(null)
  const visible = useOnceWhenVisible(sectionRef, 0.3)
  const reducedMotion = useReducedMotion()

  const score = scan.health.score
  const finalOffset = RING_CIRCUMFERENCE * (1 - score / 100)

  useEffect(() => {
    if (!visible || reducedMotion) return
    const ring = ringRef.current
    const scoreNode = scoreRef.current
    if (!ring || !scoreNode) return

    const tweens: { revert: () => unknown }[] = []

    tweens.push(
      animate(ring, {
        strokeDashoffset: [RING_CIRCUMFERENCE, finalOffset],
        duration: 1600,
        ease: 'inOutExpo',
      }),
    )

    const counter = { value: 0 }
    tweens.push(
      animate(counter, {
        value: score,
        duration: 1400,
        ease: 'outExpo',
        onUpdate: () => {
          if (scoreRef.current !== null) {
            scoreRef.current.textContent = formatCount(Math.round(counter.value))
          }
        },
      }),
    )

    const rows = rowsRef.current?.querySelectorAll<HTMLLIElement>('li')
    if (rows && rows.length > 0) {
      tweens.push(
        animate(rows, {
          opacity: [0, 1],
          translateX: [-16, 0],
          delay: stagger(90, { start: 300 }),
          duration: 450,
          ease: 'outExpo',
        }),
      )
    }

    return () => {
      for (const tween of tweens) {
        tween.revert()
      }
      scoreNode.textContent = formatCount(score)
    }
  }, [visible, reducedMotion, finalOffset, score])

  return (
    <section
      id="health"
      aria-label={`Health score: ${score} out of 100`}
      ref={sectionRef}
    >
      <h2 className={`type-section ${styles.sectionHeadline}`}>
        Health: <span ref={scoreRef} className="tabular">{score}</span> out of 100
      </h2>
      <div className={styles.healthBody}>
        <svg
          className={styles.ring}
          viewBox="0 0 120 120"
          width={220}
          height={220}
          role="img"
          aria-label={`Health ring showing a score of ${score} out of 100`}
        >
          <circle className={styles.ringTrack} cx="60" cy="60" r="54" strokeWidth="8" />
          <circle
            ref={ringRef}
            className={styles.ringProgress}
            cx="60"
            cy="60"
            r="54"
            strokeWidth="8"
            strokeLinecap="round"
            transform="rotate(-90 60 60)"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={finalOffset}
          />
        </svg>
        {scan.health.checks.length > 0 && (
          <ul className={styles.checklist} ref={rowsRef}>
            {scan.health.checks.map((check) => (
              <li key={check.name} className={styles.checkRow}>
                <span className={styles.checkName}>{check.name}</span>
                <span className={check.passed ? styles.checkPass : styles.checkMiss}>
                  {check.passed ? 'Yes' : 'Missing'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
