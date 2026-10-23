'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Scan } from '@/lib/types/scan'
import { DotStage, type DotStageHandle } from '@/components/ui/dot-stage'
import { buildReportSteps } from './step-headlines'
import { pickActiveStepIndex, type StepSample } from './step-activation'
import styles from './report.module.css'

/**
 * The story: four scroll steps on the left, one sticky dot stage on the
 * right (REFERENCE.md "Stage and story layout"). The -45% observer band
 * is only a wake trigger; the active step is the one whose box is
 * nearest the viewport middle (pure rule in step-activation.ts), so
 * scrolling down and scrolling back decide identically and a morph is
 * always handed to the engine for the step actually on screen. The
 * dispatch also self-heals: if the engine reports a different layout
 * than the one that was last requested for this step (a missed event, a
 * tier rebuild, a fast-refresh remount), the morph is re-sent instead of
 * being swallowed forever.
 */
export function Story({ scan, ariaLabel }: { scan: Scan; ariaLabel?: string }) {
  const steps = useMemo(() => buildReportSteps(scan), [scan])
  const stepsRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<DotStageHandle | null>(null)
  const lastRequestedRef = useRef<string>('')
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const root = stepsRef.current
    if (!root) return
    const stepElements = Array.from(root.querySelectorAll<HTMLElement>('[data-step-index]'))
    if (stepElements.length === 0) return
    const updateActiveStep = () => {
      const samples: StepSample[] = stepElements.map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          index: Number(element.dataset.stepIndex),
          top: rect.top,
          bottom: rect.bottom,
        }
      })
      const next = pickActiveStepIndex(samples, window.innerHeight / 2)
      if (Number.isInteger(next) && next >= 0) {
        setActiveIndex((prev) => (prev === next ? prev : next))
      }
    }
    const observer = new IntersectionObserver(
      updateActiveStep,
      // Crosses the middle of the screen (REFERENCE.md)
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    )
    for (const element of stepElements) observer.observe(element)
    // The observer always fires once per observed element right after
    // observe(), so the initial step needs no separate measurement.
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const step = steps[activeIndex]
    if (!step) return
    const desired = step.layout
    const reported = stageRef.current?.getCurrentLayout() ?? null
    if (reported === desired) {
      // The engine already targets this step's layout (its initial Files
      // morph covers the first activation), just remember it.
      lastRequestedRef.current = desired
      return
    }
    if (lastRequestedRef.current === desired) return
    lastRequestedRef.current = desired
    stageRef.current?.morphTo(desired)
  }, [activeIndex, steps])

  return (
    <div className={styles.story}>
      <div className={styles.steps} ref={stepsRef}>
        {steps.map((step, index) => (
          <section
            key={step.layout}
            data-step-index={index}
            className={index === activeIndex ? `${styles.step} ${styles.stepActive}` : styles.step}
          >
            <h2 className={`type-step ${styles.stepHeadline}`}>{step.headline}</h2>
            <p className={styles.stepBody}>{step.body}</p>
          </section>
        ))}
      </div>

      <div className={styles.stageSlot}>
        <div className={styles.stagePin}>
          <DotStage
            ref={stageRef}
            scan={scan}
            initialLayout="files"
            ariaLabel={ariaLabel ?? `Repository visual for ${scan.owner}/${scan.name} as a field of dots`}
          />
        </div>
      </div>
    </div>
  )
}
