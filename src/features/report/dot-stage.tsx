'use client'

import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import type { Scan } from '@/lib/types/scan'
import { DotEngine, type MorphOptions, type LayoutName } from '@/engine/renderer'
import styles from './dot-stage.module.css'

export interface DotStageProps {
  scan: Scan
  className?: string
  ariaLabel?: string
  initialLayout?: LayoutName
}

export interface DotStageHandle {
  morphTo: (layout: LayoutName, options?: MorphOptions) => void
  getEngine: () => DotEngine | null
}

export const DotStage = forwardRef<DotStageHandle, DotStageProps>(function DotStage(
  { scan, className, ariaLabel = 'Repository file visualization as a field of dots' },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<DotEngine | null>(null)

  useImperativeHandle(
    ref,
    () => ({
      morphTo: (layout: LayoutName, options?: MorphOptions) => {
        engineRef.current?.morphTo(layout, options)
      },
      getEngine: () => engineRef.current,
    }),
    []
  )

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const engine = new DotEngine({
      canvas,
      container,
      scan,
    })
    engineRef.current = engine

    // Watch for manual data-theme changes on <html>
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          engine.updateTheme()
        }
      }
    })
    observer.observe(document.documentElement, { attributes: true })

    // Watch for system color scheme changes
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
    }
  }, [scan])

  const stageClassName = className ? `${styles.stage} ${className}` : styles.stage

  return (
    <div ref={containerRef} className={stageClassName}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        role="img"
        aria-label={ariaLabel}
      />
    </div>
  )
})
