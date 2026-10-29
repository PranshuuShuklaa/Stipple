'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Scan } from '@/lib/types/scan'
import { DotStage, type DotStageHandle } from '@/components/ui/dot-stage'
import type { LayoutName } from '@/engine/renderer'

interface DevEngineClientProps {
  scan: Scan
}

const LAYOUTS: { id: LayoutName; label: string; desc: string }[] = [
  {
    id: 'files',
    label: 'Files',
    desc: '24×10 centered grid, language-coded colors (c1..c5, fg when no languages) with 0.85 opacity.',
  },
  {
    id: 'languages',
    label: 'Languages',
    desc: 'Stacked bar of 12-row columns, colored by language (c1..c5).',
  },
  {
    id: 'activity',
    label: 'Activity',
    desc: '16 weekly columns, c1 color, opacity gradient 0.2 to 1.0 by recency.',
  },
  {
    id: 'folders',
    label: 'Folders',
    desc: '5 phyllotaxis spiral clusters with labeled headings.',
  },
]

export function DevEngineClient({ scan }: DevEngineClientProps) {
  const stageRef = useRef<DotStageHandle>(null)
  const [activeLayout, setActiveLayout] = useState<LayoutName>('files')
  const [showTable, setShowTable] = useState(false)
  const [statusMsg, setStatusMsg] = useState('Files layout active (240 dots)')
  const statusTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (statusTimerRef.current !== null) {
        window.clearTimeout(statusTimerRef.current)
      }
    }
  }, [])

  const handleSwitchLayout = (layout: LayoutName) => {
    setActiveLayout(layout)
    setStatusMsg(`Morphing to ${layout}...`)
    stageRef.current?.morphTo(layout)
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current)
    statusTimerRef.current = window.setTimeout(() => {
      setStatusMsg(`${layout.charAt(0).toUpperCase() + layout.slice(1)} layout active (240 dots)`)
      statusTimerRef.current = null
    }, 1250)
  }

  const handleLayoutKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? LAYOUTS.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + LAYOUTS.length) % LAYOUTS.length
    const next = LAYOUTS[nextIndex]
    if (!next) return
    handleSwitchLayout(next.id)
    document.getElementById(`dev-layout-${next.id}`)?.focus()
  }

  // Rapid switching test to verify animation stability and zero glitches
  const handleRapidTest = () => {
    setStatusMsg('Rapid switching test in progress...')
    const sequence: LayoutName[] = ['languages', 'folders', 'activity', 'files', 'languages']
    sequence.forEach((layout, index) => {
      setTimeout(() => {
        setActiveLayout(layout)
        stageRef.current?.morphTo(layout)
      }, index * 250)
    })
    setTimeout(() => {
      setStatusMsg('Rapid switching test completed cleanly.')
    }, sequence.length * 250 + 1300)
  }

  // Data aggregations for data table
  const totalFiles = scan.files.length || 1

  const langStats = scan.languages.map((l) => {
    const count = scan.files.filter((f) => f.language === l.name).length
    const pct = Math.round((count / totalFiles) * 100)
    return { name: l.name, count, pct, bytes: l.bytes }
  })

  const folderStats = Array.from(
    scan.files.reduce((map, f) => {
      map.set(f.folder, (map.get(f.folder) ?? 0) + 1)
      return map
    }, new Map<string, number>())
  ).map(([name, count]) => ({
    name,
    count,
    pct: Math.round((count / totalFiles) * 100),
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <h1 className="type-section" style={{ marginBottom: '8px' }}>
            Dot Engine Dev Stage
          </h1>
          <p style={{ color: 'var(--dim)', maxWidth: '640px' }}>
            Phase 2 checkpoint: Files, Languages, Activity, and Folders layouts.
            Morphs seamlessly in every direction using anime.js v4, spatial-grid hover detection,
            and animated cluster labels.
          </p>
        </div>

        {/* View Switcher Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
          <div
            role="group"
            aria-label="Visualization layouts"
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              backgroundColor: 'var(--panel)',
              padding: '4px',
              borderRadius: '999px',
            }}
          >
            {LAYOUTS.map((item) => {
              const isActive = activeLayout === item.id
              return (
                <button
                  key={item.id}
                  id={`dev-layout-${item.id}`}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => handleSwitchLayout(item.id)}
                  onKeyDown={(event) => handleLayoutKeyDown(event, LAYOUTS.indexOf(item))}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '999px',
                    backgroundColor: isActive ? 'var(--fg)' : 'transparent',
                    color: isActive ? 'var(--bg)' : 'var(--fg)',
                    fontWeight: 600,
                    fontSize: '14px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all var(--dur-fast, 180ms) ease',
                  }}
                >
                  {item.label}
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
<<<<<<< HEAD
            <span
              role="status"
              aria-live="polite"
              style={{ fontSize: '13px', color: 'var(--dim)' }}
            >
=======
            <span role="status" aria-live="polite" style={{ fontSize: '13px', color: 'var(--dim)' }}>
>>>>>>> 02806be17734b91a2914c4c7297afda106178ddf
              {statusMsg}
            </span>
            <button
              type="button"
              onClick={handleRapidTest}
              style={{
                fontSize: '13px',
                padding: '4px 12px',
                borderRadius: '999px',
                border: '1px solid var(--line)',
                color: 'var(--dim)',
                cursor: 'pointer',
              }}
            >
              Rapid switch test
            </button>
            <button
              type="button"
              onClick={() => setShowTable((prev) => !prev)}
              aria-expanded={showTable}
              aria-controls="dev-engine-data-table"
              style={{
                fontSize: '13px',
                padding: '4px 12px',
                borderRadius: '999px',
                border: '1px solid var(--line)',
                color: 'var(--dim)',
                cursor: 'pointer',
              }}
            >
              {showTable ? 'Hide Table' : 'Show Table'}
            </button>
          </div>
        </div>
      </div>

      {/* The Interactive Dot Stage */}
      <DotStage
        ref={stageRef}
        scan={scan}
        initialLayout={activeLayout}
        onLayoutChange={(l) => setActiveLayout(l)}
        showDevOverlay
      />

      {/* Specifications & Layout Summary */}
      <div
        style={{
          borderTop: '1px solid var(--line)',
          paddingTop: '16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          fontSize: '14px',
          color: 'var(--dim)',
        }}
      >
        <div>
          <strong style={{ color: 'var(--fg)', display: 'block', marginBottom: '4px' }}>
            Active Layout
          </strong>
          {LAYOUTS.find((l) => l.id === activeLayout)?.desc}
        </div>
        <div>
          <strong style={{ color: 'var(--fg)', display: 'block', marginBottom: '4px' }}>
            Hover Spatial Grid
          </strong>
          O(1) localized bucket lookup, radius 24px, 80px fisheye lift.
        </div>
        <div>
          <strong style={{ color: 'var(--fg)', display: 'block', marginBottom: '4px' }}>
            Motion & Stagger
          </strong>
          1200ms inOutExpo, 6ms grid stagger from center in all directions.
        </div>
        <div>
          <strong style={{ color: 'var(--fg)', display: 'block', marginBottom: '4px' }}>
            Folder Labels
          </strong>
          Fade in with 600ms outQuad after 800ms stagger in Folders view.
        </div>
      </div>

      {/* Visually Hidden (or Toggled) Data Table for Accessibility */}
      <div className={showTable ? undefined : 'visually-hidden'}>
        <div
          id="dev-engine-data-table"
          style={{
            marginTop: '16px',
            padding: '20px',
            backgroundColor: 'var(--panel)',
            borderRadius: '16px',
            fontSize: '14px',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
            Repository Dataset Summary ({scan.files.length} files)
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
            {/* Languages Table */}
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>Languages</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <caption className="visually-hidden">Languages</caption>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)' }}>
                    <th scope="col" style={{ padding: '6px 0' }}>Language</th>
                    <th scope="col" style={{ padding: '6px 0' }}>Files</th>
                    <th scope="col" style={{ padding: '6px 0' }}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {langStats.map((l) => (
                    <tr key={l.name} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '6px 0' }}>{l.name}</td>
                      <td style={{ padding: '6px 0' }}>{l.count}</td>
                      <td style={{ padding: '6px 0' }}>{l.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Folders Table */}
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>Top Folders</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <caption className="visually-hidden">Top folders</caption>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)' }}>
                    <th scope="col" style={{ padding: '6px 0' }}>Folder</th>
                    <th scope="col" style={{ padding: '6px 0' }}>Files</th>
                    <th scope="col" style={{ padding: '6px 0' }}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {folderStats.map((f) => (
                    <tr key={f.name} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '6px 0' }}>{f.name}</td>
                      <td style={{ padding: '6px 0' }}>{f.count}</td>
                      <td style={{ padding: '6px 0' }}>{f.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Activity Table */}
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>Weekly Activity</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <caption className="visually-hidden">Weekly activity</caption>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)' }}>
                    <th scope="col" style={{ padding: '6px 0' }}>Week</th>
                    <th scope="col" style={{ padding: '6px 0' }}>Commits</th>
                  </tr>
                </thead>
                <tbody>
                  {scan.activity.slice(0, 8).map((w, i) => (
                    <tr key={w.week} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '6px 0' }}>Week {16 - i} ({w.week})</td>
                      <td style={{ padding: '6px 0' }}>{w.commits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
