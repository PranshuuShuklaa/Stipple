'use client'

import { useEffect, useRef } from 'react'

const DEFAULT_PALETTE = ['#5B2BE0', '#E0246E', '#C77700', '#0B8F63']
const CELL_MIN = 11
const QUIET_RADIUS = 90
const CLEAN_RADIUS_FACTOR = 1.25

type Point = { x: number; y: number }
type Rect = { left: number; top: number; right: number; bottom: number }
type Ring = { x: number; y: number; startedAt: number }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function smoothstep(value: number): number {
  const t = clamp(value, 0, 1)
  return t * t * (3 - 2 * t)
}

function parseColor(value: string): [number, number, number] {
  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const raw = hex[1].length === 3 ? hex[1].split('').map((part) => part + part).join('') : hex[1]
    return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)]
  }
  const rgb = value.match(/rgba?\(([^)]+)\)/i)
  if (rgb) {
    const parts = rgb[1].split(',').map((part) => Number.parseFloat(part.trim()))
    if (parts.length >= 3 && parts.every(Number.isFinite)) return [parts[0], parts[1], parts[2]]
  }
  return [93, 43, 224]
}

function mix(a: [number, number, number], b: [number, number, number], amount: number): string {
  return `rgb(${a.map((value, index) => Math.round(value + (b[index] - value) * amount)).join(',')})`
}

function paletteFromPage(): string[] {
  const rootPalette = document.documentElement.dataset.glowPalette?.split('|').filter(Boolean)
  if (rootPalette && rootPalette.length >= 4) return rootPalette.slice(0, 4)
  const paletteOwner = document.querySelector<HTMLElement>('[data-glow-palette]')
  const values = paletteOwner?.dataset.glowPalette?.split('|').filter(Boolean)
  if (values && values.length >= 4) return values.slice(0, 4)
  const style = getComputedStyle(document.documentElement)
  return ['--c1', '--c2', '--c3', '--c4'].map(
    (token, index) => style.getPropertyValue(token).trim() || DEFAULT_PALETTE[index],
  )
}

function rectsFor(selector: string, visibleOnly = false): Rect[] {
  return Array.from(document.querySelectorAll<HTMLElement>(selector))
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .filter((rect) => !visibleOnly || (rect.bottom > 0 && rect.right > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight))
    .map((rect) => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }))
}

function distanceToRect(point: Point, rect: Rect): number {
  const dx = Math.max(rect.left - point.x, 0, point.x - rect.right)
  const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom)
  return Math.hypot(dx, dy)
}

function quietFactor(point: Point, quietRects: Rect[], cleanRects: Rect[]): number {
  const quiet = quietRects.reduce(
    (factor, rect) => Math.min(factor, 0.12 + 0.88 * smoothstep(distanceToRect(point, rect) / QUIET_RADIUS)),
    1,
  )
  const clean = cleanRects.reduce((factor, rect) => {
    const width = rect.right - rect.left
    const height = rect.bottom - rect.top
    const center = { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 }
    const radius = Math.max(width, height) * CLEAN_RADIUS_FACTOR
    const distance = Math.hypot(point.x - center.x, point.y - center.y)
    return Math.min(factor, smoothstep((distance - radius * 0.6) / (radius * 0.4)))
  }, 1)
  return Math.min(quiet, clean)
}

export default function GlowBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    let frame = 0
    let lastFrame = 0
    let frameCount = 0
    let tier: 'high' | 'medium' | 'low' = 'high'
    let pointer = { x: -10000, y: -10000 }
    let quietRects: Rect[] = []
    let cleanRects: Rect[] = []
    let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let running = !document.hidden
    let width = 0
    let height = 0
    let dpr = 1
    let elapsed = 0
    let rings: Ring[] = []
    let scanStartedAt = -1
    let palette = DEFAULT_PALETTE.map(parseColor)

    const measureZones = () => {
      quietRects = rectsFor('[data-q], [data-quiet-zone]')
      cleanRects = rectsFor('[data-clean-zone]', true)
    }

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      palette = paletteFromPage().map(parseColor)
      measureZones()
      frameCount = 0
      tier = reducedMotion ? 'low' : 'high'
    }

    const draw = (timestamp: number) => {
      if (!running) return
      const delta = lastFrame === 0 ? 16 : Math.min(timestamp - lastFrame, 50)
      lastFrame = timestamp
      elapsed += delta / 1000
      frameCount += 1
      if (!reducedMotion && frameCount === 60) {
        const fps = frameCount / elapsed
        tier = fps < 45 ? 'low' : fps < 55 ? 'medium' : 'high'
      }

      context.clearRect(0, 0, width, height)
      const cell = Math.max(CELL_MIN, Math.round(width / 110)) * (tier === 'low' ? 1.6 : 1)
      const rows = Math.ceil(height / cell) + 1
      const pointerEnabled = tier === 'high' && !reducedMotion

      const activeRings = rings.filter((ring) => timestamp - ring.startedAt < 1400)
      rings = activeRings
      const ringState = activeRings.map((ring) => {
        const elapsed = Math.max(0, timestamp - ring.startedAt)
        return {
          ring,
          elapsed,
          radius: Math.min(1400, elapsed * 1.2),
          fade: Math.max(0, 1 - elapsed / 1400),
        }
      })
      const scanElapsed = scanStartedAt < 0 ? 0 : timestamp - scanStartedAt
      const surge = scanElapsed < 2300
        ? scanElapsed < 900
          ? scanElapsed / 900
          : 1 - (scanElapsed - 900) / 1400
        : 0

      for (let column = 0; column <= Math.ceil(width / cell); column += 1) {
        const x = column * cell
        const u = (x / Math.max(width, 1)) * 0.9 + 0.06 * Math.sin(elapsed * 0.2) + elapsed * 0.012
        const position = ((u % 1) + 1) % 1
        const segment = Math.min(3, Math.floor(position * 4))
        context.fillStyle = mix(palette[segment], palette[(segment + 1) % 4], (position * 4) % 1)
        context.beginPath()
        for (let row = 0; row < rows; row += 1) {
          const y = row * cell
          const ny = y / Math.max(height, 1)
          let value = Math.pow(ny, 2.4) * 1.25
          if (tier === 'high') {
            value *= 1 + 0.35 * Math.sin(x * 0.006 + elapsed * 0.7 + ny * 4) + 0.2 * Math.sin(x * 0.015 - elapsed * 0.9)
          }
          if (pointerEnabled) {
            const dx = x - pointer.x
            const dy = y - pointer.y
            value += Math.exp(-(dx * dx + dy * dy) / 45000) * 0.55
          }
          value *= 1 + 0.7 * Math.max(0, surge)
          for (const { ring, radius: ringRadius, fade } of ringState) {
            const dx = x - ring.x
            const dy = y - ring.y
            const distance = Math.hypot(dx, dy) || 1
            const offset = distance - ringRadius
            if (Math.abs(offset) < 90) {
              const force = Math.cos((offset / 90) * Math.PI / 2) * 16 * fade
              value += force / 20
            }
          }
          value *= quietFactor({ x, y }, quietRects, cleanRects)
          if (value < 0.06) continue
          let drawX = x
          let drawY = y
          for (const { ring, radius: ringRadius, fade } of ringState) {
            const dx = x - ring.x
            const dy = y - ring.y
            const distance = Math.hypot(dx, dy) || 1
            const offset = distance - ringRadius
            if (Math.abs(offset) < 90) {
              const force = Math.cos((offset / 90) * Math.PI / 2) * 16 * fade
              drawX += (dx / distance) * force
              drawY += (dy / distance) * force
            }
          }
          const radius = Math.max(0, Math.min(value, 1)) * cell * 0.56
          context.moveTo(drawX + radius, drawY)
          context.arc(drawX, drawY, radius, 0, Math.PI * 2)
        }
        context.fill()
      }

      for (const { ring, radius, fade } of ringState) {
        context.globalAlpha = 0.32 * fade
        context.strokeStyle = `rgb(${palette[0][0]}, ${palette[0][1]}, ${palette[0][2]})`
        context.lineWidth = 2
        context.beginPath()
        context.arc(ring.x, ring.y, radius, 0, Math.PI * 2)
        context.stroke()
      }
      context.globalAlpha = 1
      if (!reducedMotion) frame = requestAnimationFrame(draw)
    }

    const start = () => {
      if (running && frame === 0) {
        lastFrame = 0
        frame = requestAnimationFrame(draw)
      }
    }
    const stop = () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      frame = 0
    }
    const visibility = () => {
      running = !document.hidden
      if (running) start()
      else stop()
    }
    const pointerMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY }
    }
    const pointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('button, input, textarea, a, select')) return
      rings = [...rings, { x: event.clientX, y: event.clientY, startedAt: performance.now() }]
    }
    const scanStart = () => {
      scanStartedAt = performance.now()
    }
    const paletteChange = () => {
      palette = paletteFromPage().map(parseColor)
    }
    const themeObserver = new MutationObserver(paletteChange)
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const motionChange = () => {
      reducedMotion = media.matches
      stop()
      resize()
      draw(performance.now())
      if (!reducedMotion) start()
    }
    const observer = new ResizeObserver(measureZones)

    resize()
    measureZones()
    observer.observe(document.documentElement)
    window.addEventListener('resize', resize)
    window.addEventListener('scroll', measureZones, { passive: true })
    window.addEventListener('pointermove', pointerMove, { passive: true })
    window.addEventListener('pointerdown', pointerDown, { passive: true })
    window.addEventListener('stipple:scan-start', scanStart)
    window.addEventListener('stipple:palette-change', paletteChange)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-glow-palette'],
    })
    document.addEventListener('visibilitychange', visibility)
    media.addEventListener('change', motionChange)
    draw(performance.now())
    if (!reducedMotion) start()

    return () => {
      stop()
      observer.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('scroll', measureZones)
      window.removeEventListener('pointermove', pointerMove)
      window.removeEventListener('pointerdown', pointerDown)
      window.removeEventListener('stipple:scan-start', scanStart)
      window.removeEventListener('stipple:palette-change', paletteChange)
      themeObserver.disconnect()
      document.removeEventListener('visibilitychange', visibility)
      media.removeEventListener('change', motionChange)
    }
  }, [])

  return (
    <>
      <canvas ref={canvasRef} aria-hidden="true" className="glow-background" />
      <div aria-hidden="true" className="grain" />
    </>
  )
}
