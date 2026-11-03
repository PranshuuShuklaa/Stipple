'use client'

import { useEffect, useRef } from 'react'
import { animate } from 'animejs'
import styles from './hero-visual.module.css'

const POINT_COUNT = 960
const GOLDEN_ANGLE = 2.39996

interface Point {
  x: number
  y: number
  z: number
  picked: boolean
  gridIndex: number
}

interface Ring {
  x: number
  y: number
  radius: number
  amplitude: number
  startedAt: number
}

function makePoints(): Point[] {
  let gridIndex = 0
  return Array.from({ length: POINT_COUNT }, (_, index) => {
    const y = 1 - (2 * (index + 0.5)) / POINT_COUNT
    const radius = Math.sqrt(1 - y * y)
    const angle = index * GOLDEN_ANGLE
    const picked = index % 4 === 0
    return {
      x: Math.cos(angle) * radius,
      y,
      z: Math.sin(angle) * radius,
      picked,
      gridIndex: picked ? gridIndex++ : 0,
    }
  })
}

export function HeroVisual() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cleanZoneRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const cleanZone = cleanZoneRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !cleanZone || !context) return

    const points = makePoints()
    const pickedProgress = { value: 0 }
    let width = 0
    let height = 0
    let dpr = 1
    let tiltX = 0
    let tiltY = 0
    let frame = 0
    let rings: Ring[] = []

    const palette = () => {
      const root = getComputedStyle(document.documentElement)
      return ['--repo-c1', '--repo-c2', '--repo-c3', '--repo-c4', '--repo-c5'].map(
        (name, index) => root.getPropertyValue(name).trim() || root.getPropertyValue(`--c${index + 1}`).trim(),
      )
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      const wide = width > 820
      const radius = wide ? Math.min(width * 0.17, height * 0.3) : width * 0.24
      cleanZone.style.width = `${Math.max(radius * 2.5, (wide ? Math.min(width * 0.42, 560) : width * 0.8) + 68)}px`
      cleanZone.style.height = `${Math.max(radius * 2.5, (wide ? Math.min(width * 0.42, 560) / 24 * 10 : width * 0.27) + 68)}px`
    }

    const shockwave = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('button, input, textarea, a, select')) return
      rings = [...rings, { x: event.clientX, y: event.clientY, radius: 0, amplitude: 16, startedAt: performance.now() }]
    }

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      tiltX += (((event.clientX - (rect.left + rect.width / 2)) / Math.max(rect.width, 1)) - tiltX) * 0.05
      tiltY += (((event.clientY - (rect.top + rect.height / 2)) / Math.max(rect.height, 1)) - tiltY) * 0.05
    }

    const scanStart = () => {
      animate(pickedProgress, {
        value: 1,
        duration: 1300,
        ease: 'inOutExpo',
      })
    }

    const draw = (timestamp: number) => {
      const seconds = timestamp / 1000
      context.clearRect(0, 0, width, height)
      const wide = width > 820
      const centerX = wide ? width * 0.86 : width / 2
      const centerY = wide ? height * 0.55 : height * 0.22
      const radius = wide ? Math.min(width * 0.17, height * 0.3) : width * 0.24
      const pitch = (wide ? Math.min(width * 0.42, 560) : width * 0.8) / 24
      const colors = palette()
      const rotationY = seconds * 0.00028 + tiltX * 1.2
      const rotationX = 0.28 + tiltY * 0.7
      const cosY = Math.cos(rotationY)
      const sinY = Math.sin(rotationY)
      const cosX = Math.cos(rotationX)
      const sinX = Math.sin(rotationX)
      const ringNow = rings.filter((ring) => timestamp - ring.startedAt < 1400)
      rings = ringNow

      for (const point of points) {
        const x1 = point.x * cosY + point.z * sinY
        const z1 = -point.x * sinY + point.z * cosY
        const y2 = point.y * cosX - z1 * sinX
        const z2 = point.y * sinX + z1 * cosX
        const perspective = 1 + z2 * 0.15
        const sphereX = centerX + x1 * radius * perspective
        const sphereY = centerY + y2 * radius * perspective
        const depth = (z2 + 1) / 2
        const progress = Math.min(1, Math.max(0, pickedProgress.value))
        let x = sphereX
        let y = sphereY
        let alpha = 0.3 + 0.7 * depth
        let dotRadius = 1 + depth * 2.2

        if (point.picked) {
          const targetX = centerX + (point.gridIndex % 24 - 11.5) * pitch
          const targetY = centerY + (Math.floor(point.gridIndex / 24) - 4.5) * pitch
          x += (targetX - x) * progress
          y += (targetY - y) * progress
          dotRadius = dotRadius * (1 - progress) + Math.max(2.5, pitch * 0.28) * progress
          alpha = alpha * (1 - progress) + 0.95 * progress
        } else {
          x += (x - centerX) * 0.35 * progress
          y += (y - centerY) * 0.35 * progress
          alpha *= 1 - progress
        }

        for (const ring of ringNow) {
          const elapsed = Math.max(0, timestamp - ring.startedAt)
          const dx = x - ring.x
          const dy = y + canvas.getBoundingClientRect().top - ring.y
          const distance = Math.hypot(dx, dy) || 1
          const offset = distance - Math.min(1400, elapsed) * 1.2
          if (Math.abs(offset) < 90) {
            const force = Math.cos((offset / 90) * Math.PI / 2) * ring.amplitude * (1 - elapsed / 1400)
            x += (dx / distance) * force
            y += (dy / distance) * force
          }
        }

        context.globalAlpha = alpha
        context.fillStyle = colors[Math.min(4, Math.floor(((point.y + 1) / 2) * 5))] || '#9A7BFF'
        context.beginPath()
        context.arc(x, y, Math.max(0, dotRadius), 0, Math.PI * 2)
        context.fill()
      }

      context.globalAlpha = 1
      for (const ring of ringNow) {
        const elapsed = Math.max(0, timestamp - ring.startedAt)
        context.strokeStyle = `rgba(255,255,255,${Math.max(0, 0.32 * (1 - elapsed / 1400))})`
        context.lineWidth = 2
        context.beginPath()
        context.arc(ring.x, ring.y - canvas.getBoundingClientRect().top, Math.max(0, Math.min(1400, elapsed * 1.2)), 0, Math.PI * 2)
        context.stroke()
      }

      const rect = canvas.getBoundingClientRect()
      cleanZone.style.transform = `translate(${centerX - Number.parseFloat(cleanZone.style.width) / 2}px, ${centerY + rect.top - Number.parseFloat(cleanZone.style.height) / 2 - rect.top}px)`
      frame = requestAnimationFrame(draw)
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const reducedChange = () => {
      if (prefersReducedMotion.matches) pickedProgress.value = 1
    }
    resize()
    if (prefersReducedMotion.matches) pickedProgress.value = 1
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerdown', shockwave, { passive: true })
    window.addEventListener('stipple:scan-start', scanStart)
    prefersReducedMotion.addEventListener('change', reducedChange)
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', shockwave)
      window.removeEventListener('stipple:scan-start', scanStart)
      prefersReducedMotion.removeEventListener('change', reducedChange)
    }
  }, [])

  return (
    <div className={styles.visual} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.canvas} />
      <div ref={cleanZoneRef} className={styles.cleanZone} data-clean-zone />
    </div>
  )
}
