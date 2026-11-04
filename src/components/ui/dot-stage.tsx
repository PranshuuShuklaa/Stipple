'use client'

import { useEffect, useRef, useState, useImperativeHandle, forwardRef, useMemo, useCallback, useId, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { animate, stagger, createDraggable, type Draggable } from 'animejs'
import type { Scan } from '@/lib/types/scan'
import { DotEngine, type DotReadout, type MorphOptions, type LayoutName } from '@/engine/renderer'
import type { QualityTier } from '@/engine/quality'
import type { FolderLabel } from '@/engine/layouts/folders'
import type { StructureFocusState } from '@/engine/structure-navigation'
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
  /** Dev-only Structure explorer: zoomable labels, breadcrumb and dot keyboard focus. */
  structureNavigation?: boolean
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

function formatPulseDate(dateStr: string, commits: number): string {
  const commitText = commits === 1 ? '1 commit' : `${commits} commits`
  if (!dateStr) return commitText
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    const year = parseInt(parts[0]!, 10)
    const month = parseInt(parts[1]!, 10) - 1
    const day = parseInt(parts[2]!, 10)
    const d = new Date(Date.UTC(year, month, day))
    if (!isNaN(d.getTime())) {
      const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      return `${weekdays[d.getUTCDay()]}, ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}: ${commitText}`
    }
  }
  return `${dateStr}: ${commitText}`
}

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)')
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export const DotStage = forwardRef<DotStageHandle, DotStageProps>(function DotStage(
  { scan, className, ariaLabel, initialLayout = 'files', onLayoutChange, showDevOverlay = false, variant = 'full', onStageElementReady, onEngineReady, labelMode = 'animate', structureNavigation = false },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const breadcrumbRef = useRef<HTMLElement>(null)
  const labelOpacityRef = useRef(1)
  const engineRef = useRef<DotEngine | null>(null)
  const labelButtonsRef = useRef(new Map<string, HTMLButtonElement>())
  const draggablesRef = useRef<(Draggable | null)[]>([])
  const folderHelpId = useId()
  const structureHelpId = useId()

  const [currentLayout, setCurrentLayout] = useState<LayoutName>(initialLayout)
  const [hoveredFileIndex, setHoveredFileIndex] = useState<number | null>(null)
  const [folderLabels, setFolderLabels] = useState<FolderLabel[] | null>(null)
  const [structureFocus, setStructureFocus] = useState<StructureFocusState>({
    focusPath: '',
    breadcrumb: [],
  })
  const [focusedReadout, setFocusedReadout] = useState<DotReadout | null>(null)
  const [stats, setStats] = useState<{
    fps: number | null
    tier: QualityTier | null
    dotCount: number
    totalFiles: number
    filesPerDot: number
  } | null>(null)
  const isDev = process.env.NODE_ENV !== 'production'
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  )
  const resolvedAriaLabel =
    ariaLabel ??
    `Repository visual for ${scan.owner}/${scan.name}: ${scan.files.length.toLocaleString(
      'en-US',
    )} files drawn as a field of dots`

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
    const buttons = labelsRef.current?.querySelectorAll<HTMLButtonElement>('button')
    const count = Math.floor(offsets.length / 2)
    for (let slot = 0; slot < count; slot++) {
      if (slot === activeSlot) continue
      const x = offsets[slot * 2] ?? 0
      const y = offsets[slot * 2 + 1] ?? 0
      const instance = instances[slot]
      if (instance) {
        instance.setX(x, true)
        instance.setY(y, true)
      } else {
        const button = buttons?.[slot]
        if (button) button.style.transform = `translate(${x}px, ${y}px)`
      }
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

  const structureNavActive = structureNavigation && currentLayout === 'structure'

  const handleStructurePath = useCallback((path: string) => {
    engineRef.current?.zoomTo(path)
    containerRef.current?.focus()
  }, [])

  const handleStageKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const engine = engineRef.current
    if (!engine) return

    if (event.key === 'Escape' || event.key === 'Backspace') {
      event.preventDefault()
      if (event.key === 'Escape') engine.escape()
      else engine.backspace()
      return
    }

    // Label and breadcrumb buttons own their own Enter, Space and arrow keys.
    if (event.target !== event.currentTarget) return

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        engine.focusNext()
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        engine.focusPrev()
        break
      case 'Enter':
        event.preventDefault()
        engine.enter()
        break
      default:
        break
    }
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
      onStructureFocusChange: (state) => {
        setStructureFocus(state)
      },
      onDotFocusChange: (readout) => {
        setFocusedReadout(readout)
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

    // The theme toggle dispatches this synchronously inside the View
    // Transition update, so the new canvas frame is already painted when the
    // browser captures the incoming page snapshot.
    const handleThemeWave = () => {
      engine.updateTheme(undefined, { instant: true })
    }
    const handlePaletteChange = () => {
      engine.updateTheme()
    }
    window.addEventListener(THEME_WAVE_EVENT, handleThemeWave)
    window.addEventListener('stipple:palette-change', handlePaletteChange)

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleMediaChange = () => {
      engine.updateTheme()
    }
    mediaQuery.addEventListener('change', handleMediaChange)

    return () => {
      observer.disconnect()
      window.removeEventListener(THEME_WAVE_EVENT, handleThemeWave)
      window.removeEventListener('stipple:palette-change', handlePaletteChange)
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
    if (elements.length === 0) return

    // A Structure zoom starts its label fade immediately; a layout entry keeps
    // the reference 800 ms hold.
    const start = structureNavActive ? 0 : 800

    const animation = animate(elements, {
      opacity: [0, 1],
      translateY: [10, 0],
      delay: stagger(90, { start }),
      duration: 600,
      ease: 'outQuad',
    })

    return () => {
      animation.revert()
    }
  }, [folderLabels, labelMode, structureNavActive])

  // Signature 9: make the folder labels draggable. The engine owns the physics
  // (reflow stars, throw, settle) and createDraggable owns the input gesture.
  useEffect(() => {
    const engine = engineRef.current
    const container = containerRef.current
    if (!engine || !container || currentLayout !== 'folders' || !folderLabels || folderLabels.length === 0) {
      draggablesRef.current = []
      return
    }

    if (reducedMotion) {
      draggablesRef.current = []
      applyClusterOffsets(engine.getClusterOffsets(), -1)
      return
    }

    const instances = folderLabels.map((label, slot) => {
      const element = labelButtonsRef.current.get(label.key ?? label.folder)
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
  }, [folderLabels, currentLayout, reducedMotion, applyClusterOffsets])

  // Slide the breadcrumb in on every Structure focus change.
  useEffect(() => {
    if (!structureNavActive || !breadcrumbRef.current || reducedMotion) return
    const animation = animate(breadcrumbRef.current, {
      opacity: [0, 1],
      translateY: [-6, 0],
      duration: 300,
      ease: 'outQuad',
    })
    return () => {
      animation.revert()
    }
  }, [structureFocus.focusPath, structureNavActive, reducedMotion])

  const stageClassName = className ? `${styles.stage} ${className}` : styles.stage

  // Hover readout text
  const readoutContent = useMemo(() => {
    if (currentLayout === 'pulse') {
      if (hoveredFileIndex === null) return 'Hover a day to see commits.'
      const day = engineRef.current?.getPulseDay(hoveredFileIndex) ?? scan.pulse?.days?.[hoveredFileIndex]
      if (day) {
        return formatPulseDate(day.date, day.commits)
      }
      return 'Hover a day to see commits.'
    }

    const hoveredReadout =
      hoveredFileIndex !== null
        ? engineRef.current?.getDotReadout(hoveredFileIndex) ?? null
        : null
    const readout = hoveredReadout ?? focusedReadout
    if (readout) {
      const filesPrefix = readout.files > 1 ? `${readout.files} files, ` : ''
      const focusSuffix = hoveredReadout ? '' : ' (focused)'
      return `${filesPrefix}${readout.path}, ${readout.language || 'Other'}, ${formatBytes(readout.size)}${focusSuffix}`
    }

    if (structureNavActive) {
      return 'Arrow keys inspect dots. Enter opens their folder. Backspace goes up.'
    }
    if (currentLayout === 'structure') {
      return 'Folder clusters. Each label names a folder and its file count.'
    }
    return 'Hover a dot to see its file.'
  }, [hoveredFileIndex, currentLayout, focusedReadout, structureNavActive, scan.pulse])

  return (
    <div
      ref={containerRef}
      className={stageClassName}
      data-clean-zone
      tabIndex={structureNavActive ? 0 : undefined}
      role={structureNavActive ? 'group' : undefined}
      aria-label={structureNavActive ? `Folder explorer for ${scan.owner}/${scan.name}` : undefined}
      onKeyDown={structureNavActive ? handleStageKeyDown : undefined}
    >
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        role="img"
        aria-label={resolvedAriaLabel}
      />

      {/* Dev-only quality overlay (fps, tier, dot count) */}
      {isDev && showDevOverlay && stats && (
        <p className={styles.devOverlay} aria-hidden="true">
          {stats.fps !== null ? `${Math.round(stats.fps)} fps` : 'measuring…'} · tier{' '}
          {stats.tier ? stats.tier.label : '—'} · {stats.dotCount} dots
        </p>
      )}

      {structureNavActive && (
        <nav ref={breadcrumbRef} className={styles.breadcrumb} aria-label="Folder path">
          <span className={styles.crumbList}>
            <button
              type="button"
              className={styles.crumbButton}
              aria-current={structureFocus.focusPath === '' ? 'page' : undefined}
              onClick={() => handleStructurePath('')}
            >
              root
            </button>
            {structureFocus.breadcrumb.map((part, index) => {
              const path = structureFocus.breadcrumb.slice(0, index + 1).join('/')
              return (
                <span key={path} className={styles.crumbPart}>
                  <span className={styles.crumbSep} aria-hidden="true">
                    /
                  </span>
                  <button
                    type="button"
                    className={styles.crumbButton}
                    aria-current={path === structureFocus.focusPath ? 'page' : undefined}
                    onClick={() => handleStructurePath(path)}
                  >
                    {part}
                  </button>
                </span>
              )
            })}
            <button
              type="button"
              className={styles.crumbUp}
              onClick={() => {
                engineRef.current?.up()
                containerRef.current?.focus()
              }}
              disabled={structureFocus.focusPath === ''}
            >
              Up
            </button>
          </span>
        </nav>
      )}

      {/* Folders layout labels. Drag a label to move its cluster. */}
      <div
        ref={labelsRef}
        className={styles.labels}
        inert={currentLayout !== 'folders' && currentLayout !== 'structure'}
      >
        {folderLabels?.map((l, slot) => {
          const labelKey = l.key ?? l.folder
          const isStructureLabel = currentLayout === 'structure'
          const targetPath = typeof l.path === 'string' ? l.path : null
          const canZoom = structureNavActive && isStructureLabel && l.zoomable === true && targetPath !== null

          const labelContent = (
            <span className={styles.labPos}>
              <span className={styles.labText} data-label-text>
                {l.folder} ({l.count})
              </span>
            </span>
          )

          if (isStructureLabel && !canZoom) {
            return (
              <div
                key={labelKey}
                className={styles.labelAnchor}
                style={{ left: `${l.x}px`, top: `${l.y}px` }}
              >
                <span className={`${styles.lab} ${styles.labStatic} ${styles.labReadonly}`}>
                  {labelContent}
                </span>
              </div>
            )
          }

          return (
            <div
              key={labelKey}
              className={styles.labelAnchor}
              style={{ left: `${l.x}px`, top: `${l.y}px` }}
            >
              <button
                type="button"
                ref={(element) => {
                  if (element) labelButtonsRef.current.set(labelKey, element)
                  else labelButtonsRef.current.delete(labelKey)
                }}
                className={
                  canZoom
                    ? `${styles.lab} ${styles.labZoom}`
                    : reducedMotion
                      ? `${styles.lab} ${styles.labStatic}`
                      : styles.lab
                }
                aria-label={
                  canZoom
                    ? `${l.folder}, ${l.count} files. Opens this folder.`
                    : reducedMotion
                      ? `${l.folder}, ${l.count} files. Use the arrow keys to move it.`
                      : `${l.folder}, ${l.count} files. Drag to move, or use the arrow keys.`
                }
                aria-describedby={canZoom ? structureHelpId : folderHelpId}
                onClick={canZoom && targetPath ? () => handleStructurePath(targetPath) : undefined}
                onKeyDown={
                  canZoom ? undefined : (event) => handleLabelKeyDown(event, slot)
                }
              >
                {labelContent}
              </button>
            </div>
          )
        })}
      </div>

      {currentLayout === 'folders' && folderLabels && folderLabels.length > 0 && (
        <>
          <p id={folderHelpId} className="visually-hidden">
            Folder clusters can be moved. With the keyboard, focus a folder label and use the
            arrow keys to nudge it. Reset layout returns every cluster to its place.
          </p>
          <div className={styles.clusterTools}>
            <span className={styles.clusterHint}>
              {reducedMotion
                ? 'Use the arrow keys to move a focused label.'
                : 'Drag a label to move its cluster.'}
            </span>
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

      {structureNavActive && (
        <p id={structureHelpId} className="visually-hidden">
          Structure explorer. Use the arrow keys to inspect dots, Enter to open the folder of the
          focused dot, and Backspace or Escape to go up one level. The breadcrumb parts and folder
          labels are buttons.
        </p>
      )}

      {/* Hover and keyboard-focus readout */}
      {variant === 'full' && (
        <p
          className={
            structureNavActive ? `${styles.readout} ${styles.readoutStructure}` : styles.readout
          }
          data-q
          aria-live="polite"
        >
          {readoutContent}
        </p>
      )}

      {/* Legend bottom left */}
      {variant === 'full' && (
        <div className={styles.legend} data-q role="group" aria-label="Visualization legend">
          {currentLayout === 'files' && (
            <>
              <span>
                {stats && stats.totalFiles > 0 ? stats.totalFiles : scan.files.length}{' '}
                {(stats && stats.totalFiles > 0 ? stats.totalFiles : scan.files.length) === 1
                  ? 'file'
                  : 'files'}
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

          {currentLayout === 'languages' &&
            (languageStats.length > 0 ? (
              languageStats.map((item) => (
                <span key={item.name} className={styles.legendItem}>
                  <i className={styles.swatch} style={{ background: item.colorVar }} />
                  {item.name} {item.pct}%
                </span>
              ))
            ) : (
              <span className={styles.legendItem}>No language data for this repo.</span>
            ))}

          {(currentLayout === 'activity' || currentLayout === 'pulse') && (
            <span className={styles.legendItem}>
              <i className={styles.swatch} style={{ background: 'var(--c1)' }} />
              {currentLayout === 'pulse'
                ? 'Daily commits. Left is oldest, right is newest. Brighter is more active.'
                : 'Commits per week. Left is 16 weeks ago, right is this week. Brighter is newer.'}
            </span>
          )}

          {currentLayout === 'structure' && (
            <span className={styles.legendItem}>
              Folder clusters. Each label names a folder and its file count.
            </span>
          )}
        </div>
      )}
    </div>
  )
})
