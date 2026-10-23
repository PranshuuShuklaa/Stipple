'use client'

import { useRef, useState, useCallback } from 'react'
import { DotStage } from '@/components/ui/dot-stage'
import { RepoForm } from '@/features/scan-form/repo-form'
import { IntroOverlay } from '@/features/intro/intro-overlay'
import type { DotEngine } from '@/engine/renderer'
import { createScanFixture } from '../../tests/fixtures/scan-fixture'
import styles from './home.module.css'

export default function HomePage() {
  const demoScan = createScanFixture('stipple/stipple')

  const stageContainerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<DotEngine | null>(null)
  const headlineRef = useRef<HTMLHeadingElement>(null)
  const [introDone, setIntroDone] = useState(false)

  const handleIntroDone = useCallback(() => {
    setIntroDone(true)
  }, [])

  // DotStage reports its real panel element so the intro handoff can land
  // the grid exactly on the demo stage (zero jump).
  const handleStageReady = useCallback((el: HTMLDivElement) => {
    stageContainerRef.current = el
  }, [])

  // The engine is the quality-tier authority: the intro caps at 600 dots
  // and drops the shockwave when it reports the Low tier.
  const handleEngineReady = useCallback((engine: DotEngine | null) => {
    engineRef.current = engine
  }, [])

  const getIntroTier = useCallback(() => {
    return engineRef.current?.getQualityTier() ?? null
  }, [])

  return (
    <>
      {/* Boot animation overlay — removed from DOM after completion */}
      {!introDone && (
        <IntroOverlay
          stageRef={stageContainerRef}
          headlineRef={headlineRef}
          onDone={handleIntroDone}
          getTier={getIntroTier}
        />
      )}

      <div className="home">
        <div className="shell">
          <h1
            ref={headlineRef}
            className={`${styles.headline} type-display`}
            style={introDone ? undefined : { opacity: 0 }}
          >
            Your repo, <br />one dot per file.
          </h1>
          <p className={styles.sentence}>
            Paste a public GitHub repo, then scroll through its story: files,
            languages, activity and folders.
          </p>
          <RepoForm />
        </div>

        <section
          className={`${styles.demo} shell`}
          aria-labelledby="demo-heading"
        >
          <h2
            id="demo-heading"
            className={`${styles.demoLabel} type-small`}
          >
            Demo — sample data, not a real repository
          </h2>
          <DotStage
            scan={demoScan}
            ariaLabel="Demo: a sample repository with 240 files, one dot per file"
            onStageElementReady={handleStageReady}
            onEngineReady={handleEngineReady}
          />
        </section>
      </div>
    </>
  )
}
