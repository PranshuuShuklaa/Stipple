import { animate, stagger } from 'animejs'
import type { Scan } from '@/lib/types/scan'
import { MOTION } from './motion'
import { calculateFilesLayout, type LayoutTarget, type ThemeColors, type Viewport } from './layouts/files'
import { resolveThemeColors } from './colors'

export type LayoutName = 'files'

export interface MorphOptions {
  origin?: 'center' | 'first' | 'last' | [number, number]
  instant?: boolean
}

export interface DotEngineOptions {
  canvas: HTMLCanvasElement
  container?: HTMLElement
  scan: Scan
  theme?: ThemeColors
}

interface DotProgressTarget {
  p: number
}

/**
 * Framework-free Dot Engine.
 * High-performance 2D canvas renderer using typed arrays and anime.js v4 motion.
 */
export class DotEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private container: HTMLElement
  private scan: Scan
  private theme: ThemeColors

  private width = 0
  private height = 0
  private dpr = 1

  private dotCount: number

  // Typed arrays for dot properties
  private x: Float32Array
  private y: Float32Array
  private startX: Float32Array
  private startY: Float32Array
  private targetX: Float32Array
  private targetY: Float32Array

  private size: Float32Array
  private startSize: Float32Array
  private targetSize: Float32Array

  private alpha: Float32Array
  private startAlpha: Float32Array
  private targetAlpha: Float32Array

  private r: Uint8ClampedArray
  private g: Uint8ClampedArray
  private b: Uint8ClampedArray
  private startR: Uint8ClampedArray
  private startG: Uint8ClampedArray
  private startB: Uint8ClampedArray
  private targetR: Uint8ClampedArray
  private targetG: Uint8ClampedArray
  private targetB: Uint8ClampedArray

  // Animation drivers
  private progressTargets: DotProgressTarget[]
  private currentAnimation: ReturnType<typeof animate> | null = null

  // Lifecycle & loop state
  private isRunning = false
  private isIntersecting = true
  private isPageVisible = true
  private isDestroyed = false
  private rafId: number | null = null

  // Observers
  private resizeObserver: ResizeObserver | null = null
  private intersectionObserver: IntersectionObserver | null = null
  private boundVisibilityChange: () => void

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
    this.scan = options.scan
    this.theme = options.theme ?? resolveThemeColors(this.container)

    this.dotCount = this.scan.files.length

    // Initialize typed arrays
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

    // Setup viewport & start state (center, scale 0, opacity 0)
    this.updateDimensions()
    this.initStartState()

    // Setup observers
    this.boundVisibilityChange = this.handleVisibilityChange.bind(this)
    this.setupObservers()

    // Start loop
    this.checkLoop()

    // Initial transition into Files
    this.morphTo('files')
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
    // When viewport resizes, recalculate current layout target and update target positions
    const target = this.getLayoutTarget(this.currentLayout)
    for (let i = 0; i < this.dotCount; i++) {
      this.targetX[i] = target.x[i]
      this.targetY[i] = target.y[i]
      this.targetSize[i] = target.size[i]
      // If animation is completed, snap to targets
      if (this.progressTargets[i].p >= 1) {
        this.x[i] = target.x[i]
        this.y[i] = target.y[i]
        this.size[i] = target.size[i]
      }
    }
    this.render()
  }

  public getLayoutTarget(layout: LayoutName): LayoutTarget {
    const viewport: Viewport = { width: this.width, height: this.height }
    switch (layout) {
      case 'files':
      default:
        return calculateFilesLayout(this.scan, viewport, this.theme)
    }
  }

  /**
   * Morph to layout with anime.js v4 driving progress and stagger from center.
   */
  public morphTo(layout: LayoutName, options?: MorphOptions): void {
    if (this.isDestroyed) return

    this.currentLayout = layout
    const target = this.getLayoutTarget(layout)
    const origin = options?.origin ?? 'center'

    // Capture starting state from current rendered values
    for (let i = 0; i < this.dotCount; i++) {
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

    if (this.currentAnimation) {
      this.currentAnimation.pause()
      this.currentAnimation = null
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
    })

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

    this.render()
    this.rafId = requestAnimationFrame(this.loop.bind(this))
  }

  public render(): void {
    const ctx = this.ctx
    const n = this.dotCount

    ctx.clearRect(0, 0, this.width, this.height)

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

      const radius = this.size[i] / 2
      const a = this.alpha[i]

      if (radius > 0.05 && a > 0.01) {
        ctx.fillStyle = `rgba(${this.r[i]}, ${this.g[i]}, ${this.b[i]}, ${a})`
        ctx.beginPath()
        ctx.arc(this.x[i] + radius, this.y[i] + radius, radius, 0, Math.PI * 2)
        ctx.fill()
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

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundVisibilityChange)
    }
  }

  // Getters for inspectability and testing
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
}
