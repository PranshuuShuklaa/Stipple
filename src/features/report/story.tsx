'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createTimeline, onScroll } from 'animejs'
import type { Scan } from '@/lib/types/scan'
import { DotStage } from '@/components/ui/dot-stage'
import type { DotEngine } from '@/engine/renderer'
import { STORY_SEGMENT_MS } from '@/engine/motion'
import { buildReportSteps } from './step-headlines'
import { pickActiveStepIndex, type StepSample } from './step-activation'
import styles from './report.module.css'

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)')
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/**
 * The story: four scroll steps on the left, one sticky dot stage on the
 * right (REFERENCE.md "Stage and story layout"). The step nearest the
 * viewport middle drives the text. The dots are one anime.js v4 timeline
 * scrubbed by onScroll: the first step centre maps to Files, the last one
 * to Folders, and every frame is rebuilt from the engine's own per-dot
 * progress, so scrolling back reaches the same frame and stopping holds it.
 */
export function Story({ scan, ariaLabel }: { scan: Scan; ariaLabel?: string }) {
  const steps = useMemo(() => buildReportSteps(scan), [scan])
  const stepsRef = useRef<HTMLDivElement | null>(null)
  const [engine, setEngine] = useState<DotEngine | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  )

  const handleEngineReady = useCallback((next: DotEngine | null) => {
    setEngine(next)
  }, [])

  // Active step for the text copy: the box nearest the viewport middle
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

  // One scrubbed timeline for the dot stage: a 1200 ms morph plus the
  // 200 ms stagger budget per segment, linked 1:1 with the scroll.
  useEffect(() => {
    if (!engine || reducedMotion) return
    const root = stepsRef.current
    if (!root || steps.length < 2) return
    const stepElements = Array.from(root.querySelectorAll<HTMLElement>('[data-step-index]'))
    const first = stepElements[0]
    const last = stepElements[stepElements.length - 1]
    if (!first || !last) return

    engine.prepareStory(steps.map((step) => step.layout))

    const proxies = steps.slice(1).map(() => ({ p: 0 }))
    const frame = new Array<number>(proxies.length).fill(0)
    const applyFrame = () => {
      for (let i = 0; i < proxies.length; i++) frame[i] = proxies[i].p
      engine.setStoryFrame(frame)
    }

    const timeline = createTimeline({ autoplay: false })
    for (const proxy of proxies) {
      timeline.add(proxy, {
        p: 1,
        duration: STORY_SEGMENT_MS,
        ease: 'linear',
      })
    }

    // Endpoints measured from the real steps: the first step's centre sits
    // at the viewport middle at progress 0, the last one at progress 1.
    const thresholds = () => {
      const rootRect = root.getBoundingClientRect()
      const firstRect = first.getBoundingClientRect()
      const lastRect = last.getBoundingClientRect()
      const middle = window.innerHeight / 2
      return {
        enter: rootRect.top - (firstRect.top + firstRect.bottom) / 2 + middle,
        leave: rootRect.bottom - (lastRect.top + lastRect.bottom) / 2 + middle,
      }
    }

    const observer = onScroll({
      target: root,
      sync: true,
      enter: () => ({ target: 'start', container: thresholds().enter }),
      leave: () => ({ target: 'end', container: thresholds().leave }),
      onUpdate: applyFrame,
    })
    observer.link(timeline)
    // onScroll measures its explicit target on the next anime tick and
    // applies the current frame; the resize listener re-measures later.

    // A reload can restore the scroll exactly on the last step centre, where
    // the observer sits on the edge and does not emit an update. Once it has
    // measured, place the timeline at the real scroll and apply that frame
    // so the stage never sits on the intro layout past the end of the story.
    const settle = window.setTimeout(() => {
      if (!observer.ready || observer.progress <= 0) return
      timeline.seek(timeline.duration * observer.progress)
      applyFrame()
    }, 60)

    const handleResize = () => {
      if (observer.target) observer.refresh()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.clearTimeout(settle)
      window.removeEventListener('resize', handleResize)
      observer.revert()
      timeline.revert()
      engine.endStory()
    }
  }, [engine, reducedMotion, steps])

  // Reduced motion: no scrub, the active step cross-fades in 300 ms
  useEffect(() => {
    if (!engine || !reducedMotion) return
    const step = steps[activeIndex]
    if (step) engine.crossFadeTo(step.layout)
  }, [activeIndex, engine, reducedMotion, steps])

  return (
    <section className={styles.story} aria-label="The repository story">
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
            scan={scan}
            initialLayout="files"
            ariaLabel={ariaLabel ?? `Repository visual for ${scan.owner}/${scan.name} as a field of dots`}
            onEngineReady={handleEngineReady}
            labelMode={reducedMotion ? 'animate' : 'scrub'}
          />
        </div>
      </div>
    </section>
  )
}
