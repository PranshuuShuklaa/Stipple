'use client'

import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { resolveThemeColors } from '@/engine/colors'
import { THEME_WAVE_EVENT } from '@/lib/theme-wave'
import type { ScoreBandName } from './badge-svg'
import {
  buildCollapseTargets,
  buildForgeGeometry,
} from './link-forge-math'
import { layoutRectWithin } from './link-forge-layout'
import { cssColor, paintForge, type AnimatedForgeDot } from './link-forge-paint'
import {
  FORGE_REST_ALPHA,
  buildBurstTimeline,
  buildFormTimeline,
  resetDotsForForm,
  resetDotsToRest,
} from './link-forge-timeline'

type Phase = 'idle' | 'forming' | 'rest' | 'bursting' | 'spent'

interface UseLinkForgeOptions {
  badgeRef: RefObject<HTMLImageElement | null>
  active: boolean
  band: ScoreBandName
}

export interface LinkForgeControls {
  canvasRef: RefObject<HTMLCanvasElement | null>
  burst: (target: HTMLElement) => void
}

/**
 * Owns the Link forge canvas lifecycle. The dot engine publishes the page's
 * quality tier; ShareSection deactivates the forge on Low or reduced motion.
 */
export function useLinkForge({
  badgeRef,
  active,
  band,
}: UseLinkForgeOptions): LinkForgeControls {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const burstImplRef = useRef<((target: HTMLElement) => void) | null>(null)

  const burst = useCallback((target: HTMLElement) => {
    burstImplRef.current?.(target)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!active) {
      burstImplRef.current = null
      if (context) {
        context.setTransform(1, 0, 0, 1, 0, 0)
        context.clearRect(0, 0, canvas.width, canvas.height)
      }
      return
    }

    const image = badgeRef.current
    if (!image || !context) return

    let disposed = false
    let ready = false
    let formed = false
    let phase: Phase = 'idle'
    let dots: AnimatedForgeDot[] = []
    let timeline: ReturnType<typeof buildFormTimeline> | null = null
    let pausedForVisibility = false
    let dpr = 1
    let width = 0
    let height = 0
    let lastWidth = -1
    let lastHeight = -1

    const draw = (): void => {
      if (disposed) return
      paintForge(context, dots, dpr)
    }

    const cancelTimeline = (): void => {
      if (timeline) {
        timeline.cancel()
        timeline = null
      }
      pausedForVisibility = false
    }

    const setRest = (): void => {
      resetDotsToRest(dots)
      phase = 'rest'
      draw()
    }

    const plan = (): boolean => {
      if (disposed) return false
      ready = false
      const section = canvas.parentElement
      if (!section) return false

      const canvasRect = canvas.getBoundingClientRect()
      if (canvasRect.width < 1 || canvasRect.height < 1) return false

      width = canvasRect.width
      height = canvasRect.height
      lastWidth = width
      lastHeight = height
      dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      const badge = layoutRectWithin(image, section)
      if (!badge) return false

      const geometry = buildForgeGeometry(badge, { width, height })
      if (geometry.dots.length === 0) return false

      const theme = resolveThemeColors(canvas)
      const bandColor = {
        high: theme.c4,
        mid: theme.c3,
        low: theme.c2,
        neutral: theme.dim,
      }[band]
      const labelColor = cssColor(theme.fg)
      const accentColor = cssColor(bandColor)

      const midRow = (geometry.rows - 1) / 2
      const midCol = (geometry.cols - 1) / 2
      const maxRow = Math.max(midRow, geometry.rows - 1 - midRow)
      const maxCol = Math.max(midCol, geometry.cols - 1 - midCol)
      const maxDistance = Math.max(1, Math.hypot(maxRow, maxCol))

      dots = geometry.dots.map((dot) => ({
        ...dot,
        x: dot.target.x,
        y: dot.target.y,
        alpha: FORGE_REST_ALPHA,
        scale: 1,
        introDelay: Math.round(
          (Math.hypot(dot.row - midRow, dot.col - midCol) / maxDistance) * 160,
        ),
        collapse: dot.target,
        fill: dot.color === 'label' ? labelColor : accentColor,
      }))
      ready = true
      return true
    }

    const form = (): void => {
      if (disposed || formed || !ready) return
      if (!image.complete || image.naturalWidth === 0) return

      formed = true
      phase = 'forming'
      resetDotsForForm(dots)
      draw()

      const next = buildFormTimeline(dots, draw, () => {
        if (disposed) return
        if (timeline === next) timeline = null
        phase = 'rest'
        draw()
      })
      timeline = next
    }

    const initialize = (): void => {
      if (disposed) return
      if (!image.complete || image.naturalWidth === 0) return
      if (!plan()) return
      form()
    }

    const onImageLoad = (): void => {
      initialize()
    }

    const replan = (): void => {
      if (disposed) return
      const wasForming = phase === 'forming'
      const wasFormed = formed
      cancelTimeline()
      phase = 'idle'
      if (!plan()) return
      if (wasForming) {
        formed = false
        form()
      } else if (wasFormed) {
        setRest()
      } else {
        form()
      }
    }

    const onResize = (): void => {
      const rect = canvas.getBoundingClientRect()
      if (
        Math.abs(rect.width - lastWidth) < 2 &&
        Math.abs(rect.height - lastHeight) < 2
      ) {
        return
      }
      replan()
    }

    const onVisibility = (): void => {
      if (document.hidden) {
        if (timeline && !timeline.paused) {
          timeline.pause()
          pausedForVisibility = true
        }
        return
      }
      if (pausedForVisibility) {
        pausedForVisibility = false
        timeline?.resume()
      }
    }

    const burstImpl = (targetElement: HTMLElement): void => {
      if (disposed || !ready || !formed || dots.length === 0) return
      const section = canvas.parentElement
      if (!section) return

      const button = layoutRectWithin(targetElement, section)
      if (!button) return

      const collapseTargets = buildCollapseTargets(dots.length, button)
      for (let index = 0; index < dots.length; index++) {
        dots[index].collapse = collapseTargets[index] ?? dots[index].target
      }

      const fromRest = phase === 'rest'
      cancelTimeline()
      phase = 'bursting'

      const next = buildBurstTimeline(dots, fromRest, draw, () => {
        if (disposed) return
        if (timeline === next) timeline = null
        phase = 'spent'
        draw()
      })
      timeline = next
    }

    burstImplRef.current = burstImpl

    const resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(canvas)

    let themeObserver: MutationObserver | null = null
    if (typeof MutationObserver !== 'undefined') {
      themeObserver = new MutationObserver(replan)
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-theme'],
      })
    }
    // The theme toggle repaints synchronously before the browser captures
    // the incoming View Transition snapshot.
    window.addEventListener(THEME_WAVE_EVENT, replan)

    const schemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
    schemeQuery.addEventListener('change', replan)

    document.addEventListener('visibilitychange', onVisibility)
    if (!image.complete || image.naturalWidth === 0) {
      image.addEventListener('load', onImageLoad)
    }
    initialize()

    return () => {
      disposed = true
      burstImplRef.current = null
      cancelTimeline()
      resizeObserver.disconnect()
      themeObserver?.disconnect()
      window.removeEventListener(THEME_WAVE_EVENT, replan)
      schemeQuery.removeEventListener('change', replan)
      document.removeEventListener('visibilitychange', onVisibility)
      image.removeEventListener('load', onImageLoad)
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [active, band, badgeRef])

  return { canvasRef, burst }
}
