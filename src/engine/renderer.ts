import { animate, stagger } from 'animejs'
import type { Scan } from '@/lib/types/scan'
import { MOTION } from './motion'
import { calculateFilesLayout, type LayoutTarget, type ThemeColors, type Viewport } from './layouts/files'
import { calculateLanguagesLayout } from './layouts/languages'
import { calculateActivityLayout } from './layouts/activity'
import { calculateFoldersLayout, type FoldersLayoutTarget, type FolderLabel } from './layouts/folders'
import { resolveThemeColors } from './colors'
import { SpatialGrid } from './spatial-grid'
import {
  QUALITY_TIERS,
  TierController,
  FpsMeter,
  type QualityTier,
  type QualityTierName,
} from './quality'
import { buildDotField, HARD_DOT_CAP, type DotField } from './dot-field'

export type LayoutName = 'files' | 'languages' | 'activity' | 'folders'

export interface MorphOptions {
  origin?: 'center' | 'first' | 'last' | [number, number]
  instant?: boolean
}

export interface DotEngineOptions {
  canvas: HTMLCanvasElement
  container?: HTMLElement
  scan: Scan
  theme?: ThemeColors
  initialLayout?: LayoutName
  onHoverChange?: (fileIndex: number | null) => void
  onLabelsChange?: (labels: FolderLabel[] | null) => void
  onLayoutChange?: (layout: LayoutName) => void
  onTierChange?: (tier: QualityTier) => void
}

interface DotProgressTarget {
  p: number
}

/**
 * Framework-free Dot Engine.
 * High-performance 2D canvas renderer using typed arrays, spatial hashing, and anime.js v4 motion.
 */
export class DotEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private container: HTMLElement
  private rawScan: Scan
  private scan: Scan
  private theme: ThemeColors

  private dotField!: DotField

  private quality: TierController
  private qualityTier: QualityTier
  private fpsMeter = new FpsMeter()
  private lastMeasuredFps: number | null = null
  private evaluateNextSample = true

  private width = 0
  private height = 0
  private dpr = 1

  private dotCount = 0

  // Typed arrays for dot properties (allocated in allocateDots)
  private x = new Float32Array(0)
  private y = new Float32Array(0)
  private startX = new Float32Array(0)
  private startY = new Float32Array(0)
  private targetX = new Float32Array(0)
  private targetY = new Float32Array(0)

  private size = new Float32Array(0)
  private startSize = new Float32Array(0)
  private targetSize = new Float32Array(0)

  private alpha = new Float32Array(0)
  private startAlpha = new Float32Array(0)
  private targetAlpha = new Float32Array(0)

  private r = new Uint8ClampedArray(0)
  private g = new Uint8ClampedArray(0)
  private b = new Uint8ClampedArray(0)
  private startR = new Uint8ClampedArray(0)
  private startG = new Uint8ClampedArray(0)
  private startB = new Uint8ClampedArray(0)
  private targetR = new Uint8ClampedArray(0)
  private targetG = new Uint8ClampedArray(0)
  private targetB = new Uint8ClampedArray(0)

  // Animation drivers
  private progressTargets: DotProgressTarget[] = []
  private currentAnimation: ReturnType<typeof animate> | null = null

  // Lifecycle & loop state
  private isRunning = false
  private isIntersecting = true
  private isPageVisible = true
  private isDestroyed = false
  private rafId: number | null = null

  // Observers & event listeners
  private resizeObserver: ResizeObserver | null = null
  private intersectionObserver: IntersectionObserver | null = null
  private reducedMotionQuery: MediaQueryList | null = null
  private boundVisibilityChange: () => void
  private boundPointerMove: (e: PointerEvent) => void
  private boundPointerLeave: () => void
  private boundReducedMotionChange: (() => void) | null = null

  // Spatial grid for O(1) hover queries
  private spatialGrid = new SpatialGrid(36)
  private hoveredIndex = -1

  // Callbacks
  private onHoverChange?: (fileIndex: number | null) => void
  private onLabelsChange?: (labels: FolderLabel[] | null) => void
  private onLayoutChange?: (layout: LayoutName) => void
  private onTierChange?: (tier: QualityTier) => void

  // Current layout cache
  private currentLayout: LayoutName = 'files'

  constructor(options: DotEngineOptions) {
    this.canvas = options.canvas
    const context = this.canvas.getContext('2d')
    if (!context) {
      throw new Error('Canvas 2D context is not available.')
    }
    this.ctx = context
    this.container = options.container ?? this.canvas.parentElement ?? this.canvas
    this.rawScan = options.scan
    this.scan = this.rawScan
    this.theme = options.theme ?? resolveThemeColors(this.container)
    this.onHoverChange = options.onHoverChange
    this.onLabelsChange = options.onLabelsChange
    this.onLayoutChange = options.onLayoutChange
    this.onTierChange = options.onTierChange

    // Reduced motion forces the Low tier from the start (DESIGN.md)
    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.quality = new TierController(reducedMotion)
    this.qualityTier = QUALITY_TIERS[this.quality.getTier()]

    // Setup viewport & start state (center, scale 0, opacity 0)
    this.updateDimensions()
    this.allocateDots(Math.min(this.qualityTier.maxDots, HARD_DOT_CAP))

    // Setup observers and listeners
    this.boundVisibilityChange = this.handleVisibilityChange.bind(this)
    this.boundPointerMove = this.handlePointerMove.bind(this)
    this.boundPointerLeave = this.handlePointerLeave.bind(this)
    this.setupObservers()
    this.setupPointerListeners()

    // Start loop
    this.checkLoop()

    // Initial transition into target layout
    const initial = options.initialLayout ?? 'files'
    this.morphTo(initial)
  }

  private updateDimensions(): boolean {
    const rect = this.container.getBoundingClientRect()
    const rawWidth = Math.floor(rect.width || this.canvas.clientWidth || 800)
    const rawHeight = Math.floor(rect.height || this.canvas.clientHeight || 500)

    if (rawWidth === this.width && rawHeight === this.height) {
      return false
    }

    this.width = Math.max(rawWidth, 100)
    this.height = Math.max(rawHeight, 100)
    this.dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1

    this.canvas.width = Math.round(this.width * this.dpr)
    this.canvas.height = Math.round(this.height * this.dpr)
    this.canvas.style.width = `${this.width}px`
    this.canvas.style.height = `${this.height}px`

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    return true
  }

  /**
   * Rebuilds the dot field for a dot-count cap. Above 2,500 files a dot
   * stands for N files (weighted by size); tiers cap at 600/1500/3000.
   */
  private allocateDots(maxDots: number): void {
    if (this.currentAnimation) {
      this.currentAnimation.pause()
      this.currentAnimation = null
    }

    const field = buildDotField(this.rawScan, maxDots)
    this.scan = field.scan
    this.dotField = field
    this.dotCount = field.dotCount

    const n = this.dotCount
    this.x = new Float32Array(n)
    this.y = new Float32Array(n)
    this.startX = new Float32Array(n)
    this.startY = new Float32Array(n)
    this.targetX = new Float32Array(n)
    this.targetY = new Float32Array(n)

    this.size = new Float32Array(n)
    this.startSize = new Float32Array(n)
    this.targetSize = new Float32Array(n)

    this.alpha = new Float32Array(n)
    this.startAlpha = new Float32Array(n)
    this.targetAlpha = new Float32Array(n)

    this.r = new Uint8ClampedArray(n)
    this.g = new Uint8ClampedArray(n)
    this.b = new Uint8ClampedArray(n)
    this.startR = new Uint8ClampedArray(n)
    this.startG = new Uint8ClampedArray(n)
    this.startB = new Uint8ClampedArray(n)
    this.targetR = new Uint8ClampedArray(n)
    this.targetG = new Uint8ClampedArray(n)
    this.targetB = new Uint8ClampedArray(n)

    this.progressTargets = Array.from({ length: n }, () => ({ p: 1 }))

    this.hoveredIndex = -1
    this.onHoverChange?.(null)

    this.initStartState()
  }

  private initStartState(): void {
    const cx = this.width / 2
    const cy = this.height / 2 - 8
    const baseS = Math.max(6, Math.min(12, Math.round(this.width / 90)))
    const halfS = baseS / 2
    const [fgR, fgG, fgB] = this.theme.fg

    for (let i = 0; i < this.dotCount; i++) {
      this.x[i] = cx - halfS
      this.y[i] = cy - halfS
      this.startX[i] = cx - halfS
      this.startY[i] = cy - halfS
      this.targetX[i] = cx - halfS
      this.targetY[i] = cy - halfS

      this.size[i] = 0
      this.startSize[i] = 0
      this.targetSize[i] = 0

      this.alpha[i] = 0
      this.startAlpha[i] = 0
      this.targetAlpha[i] = 0

      this.r[i] = fgR
      this.g[i] = fgG
      this.b[i] = fgB
      this.startR[i] = fgR
      this.startG[i] = fgG
      this.startB[i] = fgB
      this.targetR[i] = fgR
      this.targetG[i] = fgG
      this.targetB[i] = fgB

      this.progressTargets[i].p = 1
    }
  }

  private setupObservers(): void {
    if (typeof window === 'undefined') return

    // ResizeObserver on container
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          const changed = this.updateDimensions()
          if (changed) {
            this.handleResize()
          }
        }
      }
    })
    this.resizeObserver.observe(this.container)

    // IntersectionObserver on canvas
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          this.isIntersecting = entry.isIntersecting
          this.checkLoop()
        }
      },
      { threshold: 0 }
    )
    this.intersectionObserver.observe(this.canvas)

    // Visibility change listener
    document.addEventListener('visibilitychange', this.boundVisibilityChange)
    this.isPageVisible = !document.hidden

    // Reduced-motion preference: forces the Low tier immediately
    if (typeof window.matchMedia === 'function') {
      this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
      this.boundReducedMotionChange = this.handleReducedMotionChange.bind(this)
      this.reducedMotionQuery.addEventListener('change', this.boundReducedMotionChange)
    }
  }

  private handleReducedMotionChange(): void {
    if (this.isDestroyed || !this.reducedMotionQuery) return
    this.quality.setReducedMotion(this.reducedMotionQuery.matches)
    // Accessibility change: reduced motion may bypass the cooldown to reach Low
    this.evaluateQuality(performance.now(), this.reducedMotionQuery.matches)
  }

  private setupPointerListeners(): void {
    this.canvas.addEventListener('pointermove', this.boundPointerMove)
    this.canvas.addEventListener('pointerleave', this.boundPointerLeave)
  }

  private handlePointerMove(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect()
    const qx = e.clientX - rect.left
    const qy = e.clientY - rect.top

    // Query spatial grid with max hit distance
    const hitRadius = 24
    const nearest = this.spatialGrid.findNearest(qx, qy, hitRadius)
    const newIndex = nearest ? nearest.index : -1

    if (newIndex !== this.hoveredIndex) {
      this.hoveredIndex = newIndex
      this.onHoverChange?.(newIndex !== -1 ? newIndex : null)
      this.render()
    }
  }

  private handlePointerLeave(): void {
    if (this.hoveredIndex !== -1) {
      this.hoveredIndex = -1
      this.onHoverChange?.(null)
      this.render()
    }
  }

  private handleVisibilityChange(): void {
    this.isPageVisible = !document.hidden
    this.checkLoop()
  }

  private checkLoop(): void {
    const shouldRun = this.isIntersecting && this.isPageVisible && !this.isDestroyed
    if (shouldRun && !this.isRunning) {
      this.isRunning = true
      this.rafId = requestAnimationFrame(this.loop.bind(this))
    } else if (!shouldRun && this.isRunning) {
      this.isRunning = false
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId)
        this.rafId = null
      }
    }
  }

  private handleResize(): void {
    // Re-measure over the next 60 frames after a resize (DESIGN.md)
    this.fpsMeter.reset()
    this.evaluateNextSample = true

    const target = this.getLayoutTarget(this.currentLayout)
    for (let i = 0; i < this.dotCount; i++) {
      this.targetX[i] = target.x[i]
      this.targetY[i] = target.y[i]
      this.targetSize[i] = target.size[i]
      if (this.progressTargets[i].p >= 1) {
        this.x[i] = target.x[i]
        this.y[i] = target.y[i]
        this.size[i] = target.size[i]
      }
    }

    if (this.currentLayout === 'folders' && 'labels' in target) {
      this.onLabelsChange?.((target as FoldersLayoutTarget).labels)
    }

    this.spatialGrid.build(this.x, this.y, this.size, this.dotCount, this.width, this.height)
    this.render()
  }

  public getLayoutTarget(layout: LayoutName): LayoutTarget {
    const viewport: Viewport = { width: this.width, height: this.height }
    switch (layout) {
      case 'languages':
        return calculateLanguagesLayout(this.scan, viewport, this.theme)
      case 'activity':
        return calculateActivityLayout(this.scan, viewport, this.theme)
      case 'folders':
        return calculateFoldersLayout(this.scan, viewport, this.theme)
      case 'files':
      default:
        return calculateFilesLayout(this.scan, viewport, this.theme)
    }
  }

  /**
   * Morph to layout with anime.js v4 driving progress and stagger from center.
   * Seamless and glitch-free under rapid switching in any direction.
   */
  public morphTo(layout: LayoutName, options?: MorphOptions): void {
    if (this.isDestroyed) return

    this.currentLayout = layout
    this.onLayoutChange?.(layout)

    const target = this.getLayoutTarget(layout)
    const origin = options?.origin ?? 'center'

    // Capture current in-flight positions before stopping previous animation
    for (let i = 0; i < this.dotCount; i++) {
      const p = this.progressTargets[i].p
      if (p < 1) {
        this.x[i] = this.startX[i] + (this.targetX[i] - this.startX[i]) * p
        this.y[i] = this.startY[i] + (this.targetY[i] - this.startY[i]) * p
        this.size[i] = this.startSize[i] + (this.targetSize[i] - this.startSize[i]) * p
        this.alpha[i] = this.startAlpha[i] + (this.targetAlpha[i] - this.startAlpha[i]) * p
        this.r[i] = Math.round(this.startR[i] + (this.targetR[i] - this.startR[i]) * p)
        this.g[i] = Math.round(this.startG[i] + (this.targetG[i] - this.startG[i]) * p)
        this.b[i] = Math.round(this.startB[i] + (this.targetB[i] - this.startB[i]) * p)
      } else {
        this.x[i] = this.targetX[i]
        this.y[i] = this.targetY[i]
        this.size[i] = this.targetSize[i]
        this.alpha[i] = this.targetAlpha[i]
        this.r[i] = this.targetR[i]
        this.g[i] = this.targetG[i]
        this.b[i] = this.targetB[i]
      }

      this.startX[i] = this.x[i]
      this.startY[i] = this.y[i]
      this.startSize[i] = this.size[i]
      this.startAlpha[i] = this.alpha[i]
      this.startR[i] = this.r[i]
      this.startG[i] = this.g[i]
      this.startB[i] = this.b[i]

      this.targetX[i] = target.x[i]
      this.targetY[i] = target.y[i]
      this.targetSize[i] = target.size[i]
      this.targetAlpha[i] = target.alpha[i]
      this.targetR[i] = target.r[i]
      this.targetG[i] = target.g[i]
      this.targetB[i] = target.b[i]

      this.progressTargets[i].p = 0
    }

    // Stop and discard previous animation
    if (this.currentAnimation) {
      this.currentAnimation.pause()
      this.currentAnimation = null
    }

    // Handle labels for folders layout
    if (layout === 'folders' && 'labels' in target) {
      this.onLabelsChange?.((target as FoldersLayoutTarget).labels)
    } else {
      this.onLabelsChange?.(null)
    }

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reducedMotion || options?.instant) {
      for (let i = 0; i < this.dotCount; i++) {
        this.progressTargets[i].p = 1
        this.x[i] = this.targetX[i]
        this.y[i] = this.targetY[i]
        this.size[i] = this.targetSize[i]
        this.alpha[i] = this.targetAlpha[i]
        this.r[i] = this.targetR[i]
        this.g[i] = this.targetG[i]
        this.b[i] = this.targetB[i]
      }
      this.spatialGrid.build(this.x, this.y, this.size, this.dotCount, this.width, this.height)
      this.render()
      return
    }

    // anime.js v4: inOutExpo is the exact v4 easing name
    this.currentAnimation = animate(this.progressTargets, {
      p: 1,
      duration: MOTION.duration.morph,
      delay: stagger(MOTION.stagger.morphGridMs, {
        grid: [target.cols, target.rows],
        from: origin,
      }),
      ease: MOTION.easing.inOut,
      onComplete: () => {
        this.spatialGrid.build(this.x, this.y, this.size, this.dotCount, this.width, this.height)
      },
    })

    // Build spatial grid with destination coordinates so hover works immediately
    this.spatialGrid.build(target.x, target.y, target.size, this.dotCount, this.width, this.height)
    this.checkLoop()
  }

  public updateTheme(theme?: ThemeColors): void {
    this.theme = theme ?? resolveThemeColors(this.container)
    const target = this.getLayoutTarget(this.currentLayout)
    for (let i = 0; i < this.dotCount; i++) {
      this.targetR[i] = target.r[i]
      this.targetG[i] = target.g[i]
      this.targetB[i] = target.b[i]
      if (this.progressTargets[i].p >= 1) {
        this.r[i] = target.r[i]
        this.g[i] = target.g[i]
        this.b[i] = target.b[i]
      }
    }
    this.render()
  }

  private loop(): void {
    if (!this.isRunning || this.isDestroyed) return

    const timestamp = performance.now()
    const sample = this.fpsMeter.record(timestamp)
    if (sample !== null) {
      this.lastMeasuredFps = sample
      if (this.evaluateNextSample) {
        this.evaluateNextSample = false
        this.evaluateQuality(timestamp)
      }
    }

    this.render()
    this.rafId = requestAnimationFrame(this.loop.bind(this))
  }

  /**
   * Measures the first 60 frames and picks the tier (High 55+, Medium 45-55,
   * Low under 45 or reduced motion). Switches at most once every 5 seconds.
   */
  private evaluateQuality(nowMs: number, forceLow = false): void {
    const result = this.quality.evaluate(this.lastMeasuredFps, nowMs, { forceLow })
    if (result.changed) {
      this.applyTier(result.tier)
    }
  }

  private applyTier(tier: QualityTierName): void {
    this.qualityTier = QUALITY_TIERS[tier]
    this.allocateDots(Math.min(this.qualityTier.maxDots, HARD_DOT_CAP))
    this.onTierChange?.(this.qualityTier)
    this.morphTo(this.currentLayout)
    // Re-measure after the rebuild so the tier decision is based on the new load
    this.fpsMeter.reset()
    this.evaluateNextSample = true
  }

  public render(): void {
    const ctx = this.ctx
    const n = this.dotCount

    ctx.clearRect(0, 0, this.width, this.height)

    const hovered = this.hoveredIndex
    const hx = hovered !== -1 ? this.x[hovered] + this.size[hovered] / 2 : -9999
    const hy = hovered !== -1 ? this.y[hovered] + this.size[hovered] / 2 : -9999

    // Update positions and draw dots
    for (let i = 0; i < n; i++) {
      const p = this.progressTargets[i].p

      if (p < 1) {
        this.x[i] = this.startX[i] + (this.targetX[i] - this.startX[i]) * p
        this.y[i] = this.startY[i] + (this.targetY[i] - this.startY[i]) * p
        this.size[i] = this.startSize[i] + (this.targetSize[i] - this.startSize[i]) * p
        this.alpha[i] = this.startAlpha[i] + (this.targetAlpha[i] - this.startAlpha[i]) * p
        this.r[i] = Math.round(this.startR[i] + (this.targetR[i] - this.startR[i]) * p)
        this.g[i] = Math.round(this.startG[i] + (this.targetG[i] - this.startG[i]) * p)
        this.b[i] = Math.round(this.startB[i] + (this.targetB[i] - this.startB[i]) * p)
      } else {
        this.x[i] = this.targetX[i]
        this.y[i] = this.targetY[i]
        this.size[i] = this.targetSize[i]
        this.alpha[i] = this.targetAlpha[i]
        this.r[i] = this.targetR[i]
        this.g[i] = this.targetG[i]
        this.b[i] = this.targetB[i]
      }

      let radius = this.size[i] / 2
      let a = this.alpha[i]
      const isHoveredDot = i === hovered

      // Fisheye lift for dots within 80px radius (DESIGN.md)
      if (hovered !== -1) {
        const dotCx = this.x[i] + radius
        const dotCy = this.y[i] + radius
        const dx = dotCx - hx
        const dy = dotCy - hy
        const distSq = dx * dx + dy * dy
        if (distSq < 6400) {
          // within 80px
          const dist = Math.sqrt(distSq)
          const lift = (1 - dist / 80) * 1.8
          radius += lift / 2
          a = Math.min(1.0, a + 0.15)
        }
      }

      if (radius > 0.05 && a > 0.01) {
        ctx.fillStyle = `rgba(${this.r[i]}, ${this.g[i]}, ${this.b[i]}, ${a})`
        ctx.beginPath()
        ctx.arc(this.x[i] + radius, this.y[i] + radius, radius, 0, Math.PI * 2)
        ctx.fill()

        if (isHoveredDot) {
          // Subtle focus outline on hovered dot
          ctx.strokeStyle = `rgba(${this.theme.fg[0]}, ${this.theme.fg[1]}, ${this.theme.fg[2]}, 0.8)`
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }
    }
  }

  public destroy(): void {
    this.isDestroyed = true
    this.isRunning = false

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }

    if (this.currentAnimation) {
      this.currentAnimation.pause()
      this.currentAnimation = null
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }

    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect()
      this.intersectionObserver = null
    }

    if (this.canvas) {
      this.canvas.removeEventListener('pointermove', this.boundPointerMove)
      this.canvas.removeEventListener('pointerleave', this.boundPointerLeave)
    }

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundVisibilityChange)
    }

    if (this.reducedMotionQuery && this.boundReducedMotionChange) {
      this.reducedMotionQuery.removeEventListener('change', this.boundReducedMotionChange)
      this.reducedMotionQuery = null
    }
  }

  public getCurrentLayout(): LayoutName {
    return this.currentLayout
  }

  public getQualityTier(): QualityTier {
    return this.qualityTier
  }

  public getFps(): number | null {
    return this.lastMeasuredFps
  }

  public getStats(): {
    fps: number | null
    tier: QualityTier
    dotCount: number
    totalFiles: number
    filesPerDot: number
  } {
    return {
      fps: this.lastMeasuredFps,
      tier: this.qualityTier,
      dotCount: this.dotCount,
      totalFiles: this.dotField.totalFiles,
      filesPerDot: this.dotField.filesPerDot,
    }
  }

  public getDotCount(): number {
    return this.dotCount
  }

  public getDot(index: number) {
    if (index < 0 || index >= this.dotCount) return null
    return {
      x: this.x[index],
      y: this.y[index],
      size: this.size[index],
      alpha: this.alpha[index],
      r: this.r[index],
      g: this.g[index],
      b: this.b[index],
    }
  }

  public getSpatialGrid(): SpatialGrid {
    return this.spatialGrid
  }
}
