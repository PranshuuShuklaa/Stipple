'use client'

import { useRef, useState, useCallback } from 'react'
import { DotStage } from '@/components/ui/dot-stage'
import { RepoForm } from '@/features/scan-form/repo-form'
import { IntroOverlay } from '@/features/intro/intro-overlay'
import { createScanFixture } from '../../tests/fixtures/scan-fixture'
import styles from './home.module.css'

export default function HomePage() {
  const demoScan = createScanFixture('stipple/stipple')

  const stageContainerRef = useRef<HTMLDivElement>(null)
  const headlineRef = useRef<HTMLHeadingElement>(null)
  const [introDone, setIntroDone] = useState(false)

  const handleIntroDone = useCallback(() => {
    setIntroDone(true)
  }, [])

  return (
    <>
      {/* Boot animation overlay — removed from DOM after completion */}
      {!introDone && (
        <IntroOverlay
          stageRef={stageContainerRef}
          headlineRef={headlineRef}
          onDone={handleIntroDone}
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
          {/* stageContainerRef is forwarded through DotStage via the containerRef prop
              so IntroOverlay can read its exact DOMRect for the zero-jump handoff */}
          <div ref={stageContainerRef} style={{ display: 'contents' }}>
            <DotStage
              scan={demoScan}
              ariaLabel="Demo: a sample repository with 240 files, one dot per file"
            />
          </div>
        </section>
      </div>
    </>
  )
}
