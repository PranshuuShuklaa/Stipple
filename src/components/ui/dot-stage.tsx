'use client'

import { useEffect, useRef, useState, useImperativeHandle, forwardRef, useMemo, useCallback, useId, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { animate, stagger, createDraggable, type Draggable } from 'animejs'
import type { Scan } from '@/lib/types/scan'
import { DotEngine, type MorphOptions, type LayoutName } from '@/engine/renderer'
import type { QualityTier } from '@/engine/quality'
import type { FolderLabel } from '@/engine/layouts/folders'
import { CLUSTER_SPRING } from '@/engine/effects/drag-clusters'
import { THEME_WAVE_EVENT } from '@/lib/theme-wave'
import styles from './dot-stage.module.css'

export interface DotStageProps {
  scan: Scan
  className?: string
  ariaLabel?: string
  initialLayout?: LayoutName
  onLayoutChange?: (layout: LayoutName) => void
  /** Dev-only fps/tier/dot-count overlay (used by the /dev/engine stage). */
  showDevOverlay?: boolean
  /** 'scan' hides hover readout and legend (placeholder dots must not read as data). */
  variant?: 'full' | 'scan'
  /** Reports the stage's real container element once it exists (used by the intro for the zero-jump handoff). */
  onStageElementReady?: (el: HTMLDivElement) => void
  /** Reports the dot engine (null on unmount) — e.g. so the intro can read the real quality tier. */
  onEngineReady?: (engine: DotEngine | null) => void
  /** 'scrub' lets the dot engine drive label opacity for scroll-linked story frames. */
  labelMode?: 'animate' | 'scrub'
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
  { scan, className, ariaLabel = 'Repository file visualization as a field of dots', initialLayout = 'files', onLayoutChange, showDevOverlay = false, variant = 'full', onStageElementReady, onEngineReady, labelMode = 'animate' },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const labelOpacityRef = useRef(1)
  const engineRef = useRef<DotEngine | null>(null)
  const labelButtonsRef = useRef(new Map<string, HTMLButtonElement>())
  const draggablesRef = useRef<(Draggable | null)[]>([])
  const folderHelpId = useId()

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

  // Signature 9: mirror engine-owned cluster offsets into the DOM transitions
  // that createDraggable owns. The grabbed label is skipped because the pointer
  // already drives it.
  const applyClusterOffsets = useCallback((offsets: Float32Array, activeSlot: number) => {
    const instances = draggablesRef.current
    for (let slot = 0; slot < instances.length; slot++) {
      if (slot === activeSlot) continue
      const instance = instances[slot]
      if (!instance) continue
      instance.setX(offsets[slot * 2] ?? 0, true)
      instance.setY(offsets[slot * 2 + 1] ?? 0, true)
    }
  }, [])

  const handleLabelKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, slot: number) => {
      const step = event.shiftKey ? CLUSTER_SPRING.nudgePx * 4 : CLUSTER_SPRING.nudgePx
      let dx = 0
      let dy = 0
      switch (event.key) {
        case 'ArrowLeft':
          dx = -step
          break
        case 'ArrowRight':
          dx = step
          break
        case 'ArrowUp':
          dy = -step
          break
        case 'ArrowDown':
          dy = step
          break
        default:
          return
      }
      event.preventDefault()
      engineRef.current?.nudgeCluster(slot, dx, dy)
    },
    []
  )

  const handleResetClusters = useCallback(() => {
    engineRef.current?.resetClusters()
  }, [])

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
      onLabelsOpacityChange: (opacity) => {
        labelOpacityRef.current = opacity
        if (labelsRef.current) labelsRef.current.style.opacity = String(opacity)
      },
      onLayoutChange: (layout) => {
        setCurrentLayout(layout)
        onLayoutChange?.(layout)
      },
      onTierChange: () => {
        readEngineStats()
      },
      onClusterOffsetsChange: applyClusterOffsets,
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

    // The theme toggle dispatches this synchronously inside the View
    // Transition update, so the new canvas frame is already painted when the
    // browser captures the incoming page snapshot.
    const handleThemeWave = () => {
      engine.updateTheme(undefined, { instant: true })
    }
    window.addEventListener(THEME_WAVE_EVENT, handleThemeWave)

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleMediaChange = () => {
      engine.updateTheme()
    }
    mediaQuery.addEventListener('change', handleMediaChange)

    return () => {
      observer.disconnect()
      window.removeEventListener(THEME_WAVE_EVENT, handleThemeWave)
      mediaQuery.removeEventListener('change', handleMediaChange)
      engine.destroy()
      engineRef.current = null
      onEngineReady?.(null)
    }
  }, [scan, initialLayout, onLayoutChange, readEngineStats, onStageElementReady, onEngineReady, applyClusterOffsets])

  // Dev-only stats polling for the overlay; tier changes broadcast via onTierChange
  useEffect(() => {
    if (!isDev || !showDevOverlay) return
    const interval = window.setInterval(readEngineStats, 500)
    return () => window.clearInterval(interval)
  }, [isDev, showDevOverlay, readEngineStats])

  // Animate folder labels on entry, or let the scroll timeline scrub them
  useEffect(() => {
    if (!folderLabels || folderLabels.length === 0 || !labelsRef.current) return

    const container = labelsRef.current
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (labelMode === 'scrub') {
      container.style.opacity = reducedMotion ? '1' : String(labelOpacityRef.current)
      return
    }

    container.style.opacity = '1'
    if (reducedMotion) {
      return
    }

    const elements = container.querySelectorAll<HTMLElement>('[data-label-text]')
    if (elements.length > 0) {
      animate(elements, {
        opacity: [0, 1],
        translateY: [10, 0],
        delay: stagger(90, { start: 800 }),
        duration: 600,
        ease: 'outQuad',
      })
    }
  }, [folderLabels, labelMode])

  // Signature 9: make the folder labels draggable. The engine owns the physics
  // (reflow stars, throw, settle) and createDraggable owns the input gesture.
  useEffect(() => {
    const engine = engineRef.current
    const container = containerRef.current
    if (!engine || !container || !folderLabels || folderLabels.length === 0) {
      draggablesRef.current = []
      return
    }

    const instances = folderLabels.map((label, slot) => {
      const element = labelButtonsRef.current.get(label.folder)
      if (!element) return null
      return createDraggable(element, {
        container,
        containerPadding: 8,
        releaseStiffness: CLUSTER_SPRING.stiffness,
        releaseDamping: CLUSTER_SPRING.damping,
        cursor: { onHover: 'grab', onGrab: 'grabbing' },
        onGrab: () => {
          engine.beginClusterDrag(slot)
        },
        onUpdate: (draggable) => {
          engine.setClusterDrag(slot, draggable.x, draggable.y)
        },
        onRelease: () => {
          engine.releaseClusterDrag(slot)
        },
        onSettle: (draggable) => {
          engine.setClusterDrag(slot, draggable.x, draggable.y)
          engine.settleClusterDrag(slot)
        },
      })
    })
    draggablesRef.current = instances

    const offsets = engine.getClusterOffsets()
    instances.forEach((instance, slot) => {
      if (!instance) return
      instance.setX(offsets[slot * 2] ?? 0, true)
      instance.setY(offsets[slot * 2 + 1] ?? 0, true)
    })

    return () => {
      for (const instance of instances) instance?.revert()
      draggablesRef.current = []
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

      {/* Folders layout labels. Drag a label to move its cluster. */}
      <div
        ref={labelsRef}
        className={styles.labels}
        inert={currentLayout !== 'folders'}
      >
        {folderLabels?.map((l, slot) => (
          <div
            key={l.folder}
            className={styles.labelAnchor}
            style={{
              left: `${l.x}px`,
              top: `${l.y}px`,
            }}
          >
            <button
              type="button"
              ref={(element) => {
                if (element) labelButtonsRef.current.set(l.folder, element)
                else labelButtonsRef.current.delete(l.folder)
              }}
              className={styles.lab}
              aria-label={`${l.folder}, ${l.count} files. Drag to move, or use the arrow keys.`}
              aria-describedby={folderHelpId}
              onKeyDown={(event) => handleLabelKeyDown(event, slot)}
            >
              <span className={styles.labPos}>
                <span className={styles.labText} data-label-text>
                  {l.folder} ({l.count})
                </span>
              </span>
            </button>
          </div>
        ))}
      </div>

      {folderLabels && folderLabels.length > 0 && (
        <>
          <p id={folderHelpId} className="visually-hidden">
            Folder clusters can be dragged. With the keyboard, focus a folder label and use the
            arrow keys to nudge it. Reset layout returns every cluster to its place.
          </p>
          <div className={styles.clusterTools}>
            <span className={styles.clusterHint}>Drag a label to move its cluster.</span>
            <button
              type="button"
              className={styles.resetButton}
              onClick={handleResetClusters}
            >
              Reset layout
            </button>
          </div>
        </>
      )}

      {/* Hover readout top left */}
      {variant === 'full' && <p className={styles.readout} aria-live="polite">{readoutContent}</p>}

      {/* Legend bottom left */}
      {variant === 'full' && (
        <div className={styles.legend}>
          {currentLayout === 'files' && (
            <>
              <span>
                {stats && stats.totalFiles > 0 ? stats.totalFiles : scan.files.length} files
                {stats && stats.filesPerDot > 1 ? ` · one dot = ${stats.filesPerDot} files` : ''}
              </span>
              {languageStats.length > 0 &&
                languageStats.map((item) => (
                  <span key={item.name} className={styles.legendItem}>
                    <i className={styles.swatch} style={{ background: item.colorVar }} />
                    {item.name} {item.pct}%
                  </span>
                ))}
            </>
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
              Commits per week. Left is 16 weeks ago, right is this week. Brighter is newer.
            </span>
          )}
        </div>
      )}
    </div>
  )
})
