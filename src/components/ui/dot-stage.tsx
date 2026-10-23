'use client'

import { useEffect, useRef, useState, useImperativeHandle, forwardRef, useMemo, useCallback } from 'react'
import { animate, stagger } from 'animejs'
import type { Scan } from '@/lib/types/scan'
import { DotEngine, type MorphOptions, type LayoutName } from '@/engine/renderer'
import type { QualityTier } from '@/engine/quality'
import type { FolderLabel } from '@/engine/layouts/folders'
import styles from './dot-stage.module.css'

export interface DotStageProps {
  scan: Scan
  className?: string
  ariaLabel?: string
  initialLayout?: LayoutName
  onLayoutChange?: (layout: LayoutName) => void
  /** Dev-only fps/tier/dot-count overlay (used by the /dev/engine stage). */
  showDevOverlay?: boolean
  /** Reports the stage's real container element once it exists (used by the intro for the zero-jump handoff). */
  onStageElementReady?: (el: HTMLDivElement) => void
  /** Reports the dot engine (null on unmount) — e.g. so the intro can read the real quality tier. */
  onEngineReady?: (engine: DotEngine | null) => void
}

export interface DotStageHandle {
  morphTo: (layout: LayoutName, options?: MorphOptions) => void
  getEngine: () => DotEngine | null
  getCurrentLayout: () => LayoutName
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const DotStage = forwardRef<DotStageHandle, DotStageProps>(function DotStage(
  { scan, className, ariaLabel = 'Repository file visualization as a field of dots', initialLayout = 'files', onLayoutChange, showDevOverlay = false, onStageElementReady, onEngineReady },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<DotEngine | null>(null)

  const [currentLayout, setCurrentLayout] = useState<LayoutName>(initialLayout)
  const [hoveredFileIndex, setHoveredFileIndex] = useState<number | null>(null)
  const [folderLabels, setFolderLabels] = useState<FolderLabel[] | null>(null)
  const [stats, setStats] = useState<{
    fps: number | null
    tier: QualityTier | null
    dotCount: number
    totalFiles: number
    filesPerDot: number
  } | null>(null)
  const isDev = process.env.NODE_ENV !== 'production'

  const readEngineStats = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return
    setStats(engine.getStats())
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      morphTo: (layout: LayoutName, options?: MorphOptions) => {
        engineRef.current?.morphTo(layout, options)
      },
      getEngine: () => engineRef.current,
      getCurrentLayout: () => engineRef.current?.getCurrentLayout() ?? currentLayout,
    }),
    [currentLayout]
  )

  // Calculate language distribution for legend
  const languageStats = useMemo(() => {
    const totalFiles = scan.files.length || 1
    const counts = new Map<string, number>()
    for (const f of scan.files) {
      const lang = f.language || 'Other'
      counts.set(lang, (counts.get(lang) ?? 0) + 1)
    }

    return scan.languages.slice(0, 5).map((l, i) => {
      const count = counts.get(l.name) ?? 0
      const pct = Math.round((count / totalFiles) * 100)
      return {
        name: l.name,
        pct,
        colorVar: `var(--c${i + 1})`,
      }
    })
  }, [scan])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    // Report the real panel element before anything reads the stage's rect
    onStageElementReady?.(container)

    const engine = new DotEngine({
      canvas,
      container,
      scan,
      initialLayout,
      onHoverChange: (index) => {
        setHoveredFileIndex(index)
      },
      onLabelsChange: (labels) => {
        setFolderLabels(labels)
      },
      onLayoutChange: (layout) => {
        setCurrentLayout(layout)
        onLayoutChange?.(layout)
      },
      onTierChange: () => {
        readEngineStats()
      },
    })
    engineRef.current = engine
    onEngineReady?.(engine)
    readEngineStats()

    // Watch for theme changes on <html>
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          engine.updateTheme()
        }
      }
    })
    observer.observe(document.documentElement, { attributes: true })

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleMediaChange = () => {
      engine.updateTheme()
    }
    mediaQuery.addEventListener('change', handleMediaChange)

    return () => {
      observer.disconnect()
      mediaQuery.removeEventListener('change', handleMediaChange)
      engine.destroy()
      engineRef.current = null
      onEngineReady?.(null)
    }
  }, [scan, initialLayout, onLayoutChange, readEngineStats, onStageElementReady, onEngineReady])

  // Dev-only stats polling for the overlay; tier changes broadcast via onTierChange
  useEffect(() => {
    if (!isDev || !showDevOverlay) return
    const interval = window.setInterval(readEngineStats, 500)
    return () => window.clearInterval(interval)
  }, [isDev, showDevOverlay, readEngineStats])

  // Animate folder labels on entry
  useEffect(() => {
    if (!folderLabels || folderLabels.length === 0 || !labelsRef.current) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      return
    }

    const elements = labelsRef.current.children
    if (elements.length > 0) {
      animate(elements, {
        opacity: [0, 1],
        translateY: [10, 0],
        delay: stagger(90, { start: 800 }),
        duration: 600,
        ease: 'outQuad',
      })
    }
  }, [folderLabels])

  const stageClassName = className ? `${styles.stage} ${className}` : styles.stage

  // Hover readout text
  const readoutContent = useMemo(() => {
    if (hoveredFileIndex === null) {
      return 'Hover a dot to see its file.'
    }
    const file = scan.files[hoveredFileIndex]
    if (!file) return 'Hover a dot to see its file.'
    return `${file.path}, ${file.language || 'Other'}, ${formatBytes(file.size)}`
  }, [hoveredFileIndex, scan.files])

  return (
    <div ref={containerRef} className={stageClassName}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        role="img"
        aria-label={ariaLabel}
      />

      {/* Dev-only quality overlay (fps, tier, dot count) */}
      {isDev && showDevOverlay && stats && (
        <p className={styles.devOverlay} aria-hidden="true">
          {stats.fps !== null ? `${Math.round(stats.fps)} fps` : 'measuring…'} · tier{' '}
          {stats.tier ? stats.tier.label : '—'} · {stats.dotCount} dots
        </p>
      )}

      {/* Folders layout labels */}
      <div ref={labelsRef} className={styles.labels} aria-hidden="true">
        {folderLabels?.map((l) => (
          <span
            key={l.folder}
            className={styles.lab}
            style={{
              left: `${l.x}px`,
              top: `${l.y}px`,
            }}
          >
            {l.folder} ({l.count})
          </span>
        ))}
      </div>

      {/* Hover readout top left */}
      <p className={styles.readout} aria-live="polite">
        {readoutContent}
      </p>

      {/* Legend bottom left */}
      <div className={styles.legend} aria-hidden="true">
        {currentLayout === 'files' && (
          <span>
            {stats && stats.totalFiles > 0 ? stats.totalFiles : scan.files.length} files
            {stats && stats.filesPerDot > 1 ? ` · one dot = ${stats.filesPerDot} files` : ''}
          </span>
        )}

        {currentLayout === 'languages' && (
          languageStats.map((item) => (
            <span key={item.name} className={styles.legendItem}>
              <i className={styles.swatch} style={{ background: item.colorVar }} />
              {item.name} {item.pct}%
            </span>
          ))
        )}

        {currentLayout === 'activity' && (
          <span className={styles.legendItem}>
            <i className={styles.swatch} style={{ background: 'var(--c1)' }} />
            Files changed per week. Left is 16 weeks ago, right is this week.
          </span>
        )}
      </div>
    </div>
  )
})
