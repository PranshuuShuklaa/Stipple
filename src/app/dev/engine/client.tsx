'use client'

import { useRef, useState } from 'react'
import type { Scan } from '@/lib/types/scan'
import { DotStage, type DotStageHandle } from '@/features/report/dot-stage'

interface DevEngineClientProps {
  scan: Scan
}

export function DevEngineClient({ scan }: DevEngineClientProps) {
  const stageRef = useRef<DotStageHandle>(null)
  const [status, setStatus] = useState<string>('Files layout active (240 dots)')

  const handleReplay = () => {
    setStatus('Replaying morph to Files...')
    stageRef.current?.morphTo('files')
    setTimeout(() => {
      setStatus('Files layout active (240 dots)')
    }, 1300)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h1 className="type-section" style={{ marginBottom: '8px' }}>
            Dot Engine Dev Stage
          </h1>
          <p style={{ color: 'var(--dim)', maxWidth: '640px' }}>
            Phase 2, Part A checkpoint. Canvas 2D renderer with typed arrays and anime.js v4.
            Mounted with 240 fixture files, 24×10 grid, centered pitch, and center stagger.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', color: 'var(--dim)' }}>{status}</span>
          <button
            type="button"
            onClick={handleReplay}
            style={{
              padding: '8px 16px',
              borderRadius: '999px',
              backgroundColor: 'var(--fg)',
              color: 'var(--bg)',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Replay morph
          </button>
        </div>
      </div>

      <DotStage ref={stageRef} scan={scan} />

      <div
        style={{
          borderTop: '1px solid var(--line)',
          paddingTop: '16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          fontSize: '14px',
          color: 'var(--dim)',
        }}
      >
        <div>
          <strong style={{ color: 'var(--fg)', display: 'block' }}>Fixture files</strong>
          {scan.files.length} files (24 cols × 10 rows)
        </div>
        <div>
          <strong style={{ color: 'var(--fg)', display: 'block' }}>Stage styling</strong>
          --panel surface with 24px radius
        </div>
        <div>
          <strong style={{ color: 'var(--fg)', display: 'block' }}>Easing & timing</strong>
          1200ms inOutExpo, 6ms center stagger
        </div>
        <div>
          <strong style={{ color: 'var(--fg)', display: 'block' }}>Quality & loop</strong>
          IntersectionObserver + visibilitychange
        </div>
      </div>
    </div>
  )
}
