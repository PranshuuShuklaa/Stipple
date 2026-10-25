import { animate, stagger } from 'animejs'
import type { Scan } from '@/lib/types/scan'
import { MOTION } from './motion'
import {
  computeStoryDelays,
  resolveStoryFrame,
  storyDotProgress,
  storyLabelOpacity,
  type StoryFrameState,
} from './story'
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
import { publishQualityTier } from './quality-signal'
import { buildDotField, HARD_DOT_CAP, type DotField } from './dot-field'
import { PointerWakeEffect } from './effects/pointer-wake'
import { ShockwaveEffect } from './effects/shockwave'
import { SweepEffect, type SweepMode } from './effects/sweep'

export type LayoutName = 'files' | 'languages' | 'activity' | 'folders'

export interface MorphOptions {
  origin?: 'center' | 'first' | 'last' | [number, number]
  instant?: boolean
}

/**
 * Stagger-origin precedence for morphs (REFERENCE.md "After the intro"):
 * an explicit options.origin wins; otherwise the most recent pointer click
 * position (canvas-local [x, y]); with no clicks recorded, the canvas center.
 */
export function pickMorphOrigin(
  optionsOrigin: MorphOptions['origin'],
  lastClick: readonly [number, number] | null
): NonNullable<MorphOptions['origin']> {
  if (optionsOrigin !== undefined) return optionsOrigin
  if (lastClick) return [lastClick[0], lastClick[1]]
  return 'center'
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * anime.js v4's grid stagger treats a `[x, y]` `from` as FRACTIONS of the
 * grid (utils/stagger.js: `from[0] * (grid[0] - 1)`), not as pixels. Click
 * origins are recorded in canvas pixels, so they ship here normalized to
 * 0..1 on both axes before reaching stagger — otherwise one click adds
 * enormous per-dot delays and every later morph looks frozen.
 */
export function pixelOriginToFraction(
  origin: readonly [number, number],
  width: number,
  height: number,
): [number, number] {
  if (width <= 0 || height <= 0) return [0.5, 0.5]
  return [clamp01(origin[0] / width), clamp01(origin[1] / height)]
}

export interface DotEngineOptions {
  canvas: HTMLCanvasElement
  container?: HTMLElement
  scan: Scan
  theme?: ThemeColors
  initialLayout?: LayoutName
  onHoverChange?: (fileIndex: number | null) => void
  onLabelsChange?: (labels: FolderLabel[] | null) => void
  onLabelsOpacityChange?: (opacity: number) => void
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

  // Scroll-scrubbed story (every frame is a function of the segment frames)
  private storyMode = false
  private storyLayouts: LayoutName[] = []
  private storyTargets: LayoutTarget[] = []
  private storyDelays: Float32Array[] = []
  private storyFrames: number[] = []
  private storyLayoutIndex = -1

  // Reduced-motion 300 ms cross-fade (outgoing frame snapshot + incoming dots)
  private crossFadeSnapshot: HTMLCanvasElement | null = null
  private crossFadeAlpha = 1

  // Lifecycle & loop state
  private isRunning = false
  private isIntersecting = true
  private isPageVisible = true
  private isDestroyed = false
  private rafId: number | null = null

  // Effects: pointer wake (physics spring) and click shockwave
  private pointerWake = new PointerWakeEffect()
  private shockwave = new ShockwaveEffect()
  // Scan sweep: gray-held dots, line and shimmer (loading screen only)
  private sweep = new SweepEffect()
  private pointerX = -9999
  private pointerY = -9999
  // Most recent pointerdown position (canvas-local) — default morph origin
  private lastClick: [number, number] | null = null

  // Observers & event listeners
  private resizeObserver: ResizeObserver | null = null
  private intersectionObserver: IntersectionObserver | null = null
  private reducedMotionQuery: MediaQueryList | null = null
  private boundVisibilityChange: () => void
  private boundPointerMove: (e: PointerEvent) => void
  private boundPointerLeave: () => void
  private boundPointerOut: (e: PointerEvent) => void
  private boundPointerDown: (e: PointerEvent) => void
  private boundPointerUp: (e: PointerEvent) => void
  private boundPointerCancel: () => void
  private boundReducedMotionChange: (() => void) | null = null

  // Spatial grid for O(1) hover queries
  private spatialGrid = new SpatialGrid(36)
  private hoveredIndex = -1

  // Callbacks
  private onHoverChange?: (fileIndex: number | null) => void
  private onLabelsChange?: (labels: FolderLabel[] | null) => void
  private onLabelsOpacityChange?: (opacity: number) => void
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
    this.onLabelsOpacityChange = options.onLabelsOpacityChange
    this.onLayoutChange = options.onLayoutChange
    this.onTierChange = options.onTierChange

    // Reduced motion forces the Low tier from the start (DESIGN.md)
    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.sweep.setReducedMotion(reducedMotion)
    this.quality = new TierController(reducedMotion)
    this.qualityTier = QUALITY_TIERS[this.quality.getTier()]
    publishQualityTier(this.qualityTier.name)

    // Setup viewport & start state (center, scale 0, opacity 0)
    this.updateDimensions()
    this.allocateDots(Math.min(this.qualityTier.maxDots, HARD_DOT_CAP))

    // Setup observers and listeners
    this.boundVisibilityChange = this.handleVisibilityChange.bind(this)
    this.boundPointerMove = this.handlePointerMove.bind(this)
    this.boundPointerLeave = this.handlePointerLeave.bind(this)
    this.boundPointerOut = this.handlePointerOut.bind(this)
    this.boundPointerDown = this.handlePointerDown.bind(this)
    this.boundPointerUp = this.handlePointerUp.bind(this)
    this.boundPointerCancel = this.handlePointerCancel.bind(this)
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
    this.pointerWake.allocate(n)

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
    this.sweep.setReducedMotion(this.reducedMotionQuery.matches)
    // Accessibility change: reduced motion may bypass the cooldown to reach Low
    this.evaluateQuality(performance.now(), this.reducedMotionQuery.matches)
  }

  private setupPointerListeners(): void {
    this.canvas.addEventListener('pointermove', this.boundPointerMove)
    this.canvas.addEventListener('pointerleave', this.boundPointerLeave)
    this.canvas.addEventListener('pointerout', this.boundPointerOut)
    this.canvas.addEventListener('pointerdown', this.boundPointerDown)
    this.canvas.addEventListener('pointerup', this.boundPointerUp)
    this.canvas.addEventListener('pointercancel', this.boundPointerCancel)
  }

  private handlePointerMove(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect()
    const qx = e.clientX - rect.left
    const qy = e.clientY - rect.top

    if (qx < 0 || qx > this.width || qy < 0 || qy > this.height) {
      this.handlePointerLeave()
      return
    }

    this.pointerX = qx
    this.pointerY = qy

    // Query spatial grid with max hit distance
    const hitRadius = 24
    const nearest = this.spatialGrid.findNearest(qx, qy, hitRadius)
    const newIndex = nearest ? nearest.index : -1

    if (newIndex !== this.hoveredIndex) {
      this.hoveredIndex = newIndex
      this.onHoverChange?.(newIndex !== -1 ? newIndex : null)
    }
  }

  private handlePointerLeave(): void {
    this.pointerX = -9999
    this.pointerY = -9999
    if (this.hoveredIndex !== -1) {
      this.hoveredIndex = -1
      this.onHoverChange?.(null)
    }
  }

  private handlePointerOut(e: PointerEvent): void {
    if (e.target === this.canvas && (e.relatedTarget === null || !this.canvas.contains(e.relatedTarget as Node))) {
      this.handlePointerLeave()
    }
  }

  private handlePointerDown(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    if (clickX < 0 || clickX > this.width || clickY < 0 || clickY > this.height) {
      return
    }

    this.pointerX = clickX
    this.pointerY = clickY
    // Remember every click so the next morph staggers from it, on any tier
    this.lastClick = [clickX, clickY]
    // Low tier: no shockwave (DESIGN.md / REFERENCE.md)
    if (this.qualityTier.name === 'low') return
    this.shockwave.trigger(clickX, clickY)
  }

  private handlePointerUp(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      this.handlePointerLeave()
    }
  }

  private handlePointerCancel(): void {
    this.handlePointerLeave()
  }

  /** External API: fire a shockwave at canvas-local (x, y). Used by the intro overlay. */
  public triggerShockwave(x: number, y: number): void {
    if (this.isDestroyed || this.qualityTier.name === 'low') return
    this.shockwave.trigger(x, y)
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

    if (this.storyMode && this.storyTargets.length >= 2) {
      this.rebuildStoryPlan()
      this.storyLayoutIndex = -1
      this.applyStoryFrame()
      return
    }

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
    const picked = pickMorphOrigin(options?.origin, this.lastClick)
    // Grid stagger `from: [x, y]` expects grid fractions, not canvas pixels.
    const origin = Array.isArray(picked) ? pixelOriginToFraction(picked, this.width, this.height) : picked

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

    this.setLayoutLabels(layout, target)

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

  /**
   * Hands the engine the story layouts. After this the scroll timeline is the
   * only writer of progress; the current frame is left untouched so the
   * intro bloom keeps running until the first scrub frame arrives.
   */
  public prepareStory(layouts: readonly LayoutName[]): void {
    if (this.isDestroyed || layouts.length < 2) return
    this.storyMode = true
    this.storyLayouts = [...layouts]
    this.storyLayoutIndex = -1
    this.rebuildStoryPlan()
    const segmentCount = this.storyLayouts.length - 1
    if (this.storyFrames.length !== segmentCount) {
      this.storyFrames = new Array<number>(segmentCount).fill(0)
    }
  }

  /**
   * Draws one story frame from scratch. Every dot is placed from its own
   * eased, staggered progress, so the same frame appears whether the page is
   * scrolling down, scrolling up, or stopped.
   */
  public setStoryFrame(frames: readonly number[]): void {
    if (this.isDestroyed || !this.storyMode || this.storyTargets.length < 2) return
    const segmentCount = this.storyTargets.length - 1
    const next = new Array<number>(segmentCount)
    for (let i = 0; i < segmentCount; i++) next[i] = clamp01(frames[i] ?? 0)
    this.storyFrames = next

    if (this.currentAnimation) {
      this.currentAnimation.pause()
      this.currentAnimation = null
    }
    // A late reduced-motion cross-fade must not stay layered over the story.
    this.clearCrossFade()

    this.applyStoryFrame()
  }

  /**
   * Reduced-motion fallback (DESIGN.md): no dots travel. The outgoing frame
   * is frozen to an offscreen canvas and faded out in 300 ms while the new
   * layout fades in underneath it.
   */
  public crossFadeTo(layout: LayoutName): void {
    if (this.isDestroyed) return

    if (this.currentAnimation) {
      this.currentAnimation.pause()
      this.currentAnimation = null
    }

    this.storyMode = false
    this.storyLayouts = []
    this.storyTargets = []
    this.storyDelays = []
    this.storyFrames = []
    this.storyLayoutIndex = -1

    const snapshot = this.captureSnapshot()
    this.clearCrossFade()
    const target = this.getLayoutTarget(layout)

    for (let i = 0; i < this.dotCount; i++) {
      this.x[i] = this.targetX[i] = target.x[i]
      this.y[i] = this.targetY[i] = target.y[i]
      this.size[i] = this.targetSize[i] = target.size[i]
      this.alpha[i] = this.targetAlpha[i] = target.alpha[i]
      this.r[i] = this.targetR[i] = target.r[i]
      this.g[i] = this.targetG[i] = target.g[i]
      this.b[i] = this.targetB[i] = target.b[i]
      this.progressTargets[i].p = 1
    }

    this.currentLayout = layout
    this.onLayoutChange?.(layout)
    this.setLayoutLabels(layout, target)
    this.spatialGrid.build(this.x, this.y, this.size, this.dotCount, this.width, this.height)

    if (!snapshot) {
      this.render()
      return
    }

    this.crossFadeSnapshot = snapshot
    this.crossFadeAlpha = 0
    const proxy = { a: 0 }
    this.currentAnimation = animate(proxy, {
      a: 1,
      duration: MOTION.duration.crossFade,
      ease: 'linear',
      onUpdate: () => {
        this.crossFadeAlpha = proxy.a
        this.render()
      },
      onComplete: () => {
        this.crossFadeAlpha = 1
        this.crossFadeSnapshot = null
        this.currentAnimation = null
        this.render()
      },
    })
    this.checkLoop()
  }

  public endStory(): void {
    if (this.isDestroyed) return
    this.storyMode = false
    this.storyLayouts = []
    this.storyTargets = []
    this.storyDelays = []
    this.storyFrames = []
    this.storyLayoutIndex = -1
    this.clearCrossFade()
    this.onLabelsOpacityChange?.(1)
  }

  private rebuildStoryPlan(): void {
    this.storyTargets = this.storyLayouts.map((layout) => this.getLayoutTarget(layout))
    this.storyDelays = this.storyTargets.slice(1).map((target) =>
      computeStoryDelays(this.dotCount, target.cols, target.rows)
    )
  }

  private applyStoryFrame(): void {
    if (!this.storyMode || this.storyTargets.length < 2 || this.storyFrames.length === 0) return
    const state = resolveStoryFrame(this.storyFrames)
    const from = this.storyTargets[state.segment]
    const to = this.storyTargets[state.segment + 1]
    if (!from || !to) return
    const delays = this.storyDelays[state.segment]

    for (let i = 0; i < this.dotCount; i++) {
      const q = storyDotProgress(state.progress, delays?.[i] ?? 0)
      this.x[i] = this.targetX[i] = from.x[i] + (to.x[i] - from.x[i]) * q
      this.y[i] = this.targetY[i] = from.y[i] + (to.y[i] - from.y[i]) * q
      this.size[i] = this.targetSize[i] = from.size[i] + (to.size[i] - from.size[i]) * q
      this.alpha[i] = this.targetAlpha[i] = from.alpha[i] + (to.alpha[i] - from.alpha[i]) * q
      this.r[i] = this.targetR[i] = Math.round(from.r[i] + (to.r[i] - from.r[i]) * q)
      this.g[i] = this.targetG[i] = Math.round(from.g[i] + (to.g[i] - from.g[i]) * q)
      this.b[i] = this.targetB[i] = Math.round(from.b[i] + (to.b[i] - from.b[i]) * q)
      this.progressTargets[i].p = 1
    }

    this.spatialGrid.build(this.x, this.y, this.size, this.dotCount, this.width, this.height)
    this.syncStoryLayout(state)
    this.render()
  }

  private syncStoryLayout(state: StoryFrameState): void {
    const indexChanged = state.layoutIndex !== this.storyLayoutIndex
    this.storyLayoutIndex = state.layoutIndex
    const layout = this.storyLayouts[state.layoutIndex]
    const target = this.storyTargets[state.layoutIndex]

    if (layout && layout !== this.currentLayout) {
      this.currentLayout = layout
      this.onLayoutChange?.(layout)
    }

    const hasLabels = layout === 'folders' && target !== undefined && 'labels' in target
    if (indexChanged) {
      if (hasLabels) {
        this.onLabelsChange?.((target as FoldersLayoutTarget).labels)
      } else {
        this.onLabelsChange?.(null)
      }
    }

    this.onLabelsOpacityChange?.(
      hasLabels ? storyLabelOpacity(this.storyFrames[state.layoutIndex - 1] ?? 0) : 0
    )
  }

  private setLayoutLabels(layout: LayoutName, target: LayoutTarget): void {
    if (layout === 'folders' && 'labels' in target) {
      this.onLabelsChange?.((target as FoldersLayoutTarget).labels)
    } else {
      this.onLabelsChange?.(null)
    }
    this.onLabelsOpacityChange?.(1)
  }

  private captureSnapshot(): HTMLCanvasElement | null {
    if (typeof document === 'undefined' || this.width <= 0 || this.height <= 0) return null
    const snapshot = document.createElement('canvas')
    snapshot.width = this.canvas.width
    snapshot.height = this.canvas.height
    const snapshotCtx = snapshot.getContext('2d')
    if (!snapshotCtx) return null
    snapshotCtx.drawImage(this.canvas, 0, 0)
    return snapshot
  }

  private clearCrossFade(): void {
    this.crossFadeSnapshot = null
    this.crossFadeAlpha = 1
  }

  public updateTheme(theme?: ThemeColors): void {
    this.theme = theme ?? resolveThemeColors(this.container)

    if (this.storyMode && this.storyTargets.length >= 2) {
      this.rebuildStoryPlan()
      this.storyLayoutIndex = -1
      this.applyStoryFrame()
      return
    }

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

  /**
   * Swaps the underlying scan without losing the field: when the dot
   * count is unchanged (tree placeholder count = real file count) only
   * colors and sizes retarget smoothly; otherwise the field re-blooms
   * from the center into the new count.
   */
  public setScan(scan: Scan): void {
    if (this.isDestroyed) return
    this.rawScan = scan
    const story = this.storyMode
    const desired = Math.min(scan.files.length, this.qualityTier.maxDots, HARD_DOT_CAP)
    if (desired === this.dotCount) {
      this.dotField = buildDotField(scan, this.dotCount)
      this.scan = this.dotField.scan
    } else {
      this.allocateDots(Math.min(this.qualityTier.maxDots, HARD_DOT_CAP))
    }

    if (story) {
      this.rebuildStoryPlan()
      this.storyLayoutIndex = -1
      this.applyStoryFrame()
      return
    }
    this.morphTo(this.currentLayout)
  }

  public setSweepMode(mode: SweepMode): void {
    this.sweep.setMode(mode)
  }

  public setSweepLine(fraction: number): void {
    this.sweep.setLine(fraction)
  }

  public getSweepLine(): number {
    return this.sweep.getLine()
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

    // Tick pointer-wake physics (High tier only)
    if (this.qualityTier.effects.pointerField) {
      this.pointerWake.update(
        this.x, this.y, this.size, this.dotCount,
        this.pointerX, this.pointerY,
        this.width, this.height
      )
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
    publishQualityTier(this.qualityTier.name)
    // Same density as the current field: keep every typed array and any
    // in-flight morph — only pointers/effects and the tier stat change.
    // Rebuilding during a scroll would reset the whole field visually.
    if (this.dotCount === Math.min(this.rawScan.files.length, QUALITY_TIERS[tier].maxDots, HARD_DOT_CAP)) {
      this.onTierChange?.(this.qualityTier)
      return
    }
    this.allocateDots(Math.min(this.qualityTier.maxDots, HARD_DOT_CAP))
    this.onTierChange?.(this.qualityTier)
    if (this.storyMode) {
      this.rebuildStoryPlan()
      this.storyLayoutIndex = -1
      this.applyStoryFrame()
    } else {
      this.morphTo(this.currentLayout)
    }
    // Re-measure after the rebuild so the tier decision is based on the new load
    this.fpsMeter.reset()
    this.evaluateNextSample = true
  }

  public render(nowMs: number = performance.now()): void {
    const ctx = this.ctx
    const n = this.dotCount

    ctx.clearRect(0, 0, this.width, this.height)

    if (this.crossFadeSnapshot) {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalAlpha = clamp01(1 - this.crossFadeAlpha)
      ctx.drawImage(this.crossFadeSnapshot, 0, 0)
      ctx.restore()
    }

    const fade = this.crossFadeSnapshot ? this.crossFadeAlpha : 1
    const hovered = this.hoveredIndex
    const hx = hovered !== -1 ? this.x[hovered] + this.size[hovered] / 2 : -9999
    const hy = hovered !== -1 ? this.y[hovered] + this.size[hovered] / 2 : -9999
    const hasWake = this.qualityTier.effects.pointerField
    const hasShockwave = this.qualityTier.name !== 'low' && this.shockwave.getActiveCount() > 0
    const sweepHolds = this.sweep.holdsColors()
    const sweepShimmer = sweepHolds && this.sweep.isShimmering()

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
      let a = this.alpha[i] * fade
      const isHoveredDot = i === hovered

      // Base canvas-space center of this dot
      let cx = this.x[i] + radius
      let cy = this.y[i] + radius

      // Pointer wake spring offset (High tier only)
      if (hasWake) {
        cx += this.pointerWake.getOffsetX(i)
        cy += this.pointerWake.getOffsetY(i)
      }

      // Shockwave radial displacement (Medium + High tiers)
      if (hasShockwave) {
        const [swX, swY] = this.shockwave.getDisplacement(cx, cy)
        cx += swX
        cy += swY
      }

      // Fisheye lift for dots within 80px radius (DESIGN.md)
      if (hovered !== -1) {
        const dx = cx - hx
        const dy = cy - hy
        const distSq = dx * dx + dy * dy
        if (distSq < 6400) {
          // within 80px
          const dist = Math.sqrt(distSq)
          const lift = (1 - dist / 80) * 1.8
          radius += lift / 2
          a = Math.min(1.0, a + 0.15 * fade)
        }
      }

      // Scan sweep: hold the scan's real colors back until the line
      // passes; the indeterminate shimmer modulates alpha otherwise.
      if (sweepHolds) {
        if (sweepShimmer && this.width > 0) {
          a = Math.max(0.05, a * this.sweep.shimmerFactor(this.targetX[i] / this.width, nowMs))
        }
        if (!this.sweep.isRevealed(this.targetX[i] + this.targetSize[i] / 2, this.width)) {
          ctx.fillStyle = this.sweep.grayFill(a, this.theme.dim)
          if (radius > 0.05 && a > 0.01) {
            ctx.beginPath()
            ctx.arc(cx, cy, radius, 0, Math.PI * 2)
            ctx.fill()
          }
          continue
        }
      }

      if (radius > 0.05 && a > 0.01) {
        ctx.fillStyle = `rgba(${this.r[i]}, ${this.g[i]}, ${this.b[i]}, ${a})`
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.fill()

        if (isHoveredDot) {
          // Subtle focus outline on hovered dot
          ctx.strokeStyle = `rgba(${this.theme.fg[0]}, ${this.theme.fg[1]}, ${this.theme.fg[2]}, 0.8)`
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }
    }

    this.sweep.drawLine(ctx, this.width, this.height, this.theme.fg)
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
    this.crossFadeSnapshot = null
    this.storyMode = false
    this.storyLayouts = []
    this.storyTargets = []
    this.storyDelays = []
    this.storyFrames = []

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
      this.canvas.removeEventListener('pointerout', this.boundPointerOut)
      this.canvas.removeEventListener('pointerdown', this.boundPointerDown)
      this.canvas.removeEventListener('pointerup', this.boundPointerUp)
      this.canvas.removeEventListener('pointercancel', this.boundPointerCancel)
    }

    this.shockwave.destroy()
    this.sweep.setMode('off')
    this.sweep.setLine(0)

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
