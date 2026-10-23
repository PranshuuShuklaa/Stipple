'use client'

/**
 * IntroOverlay — the boot animation for Stipple.
 *
 * Architecture:
 *  - Runs on a canvas overlay above the whole page (position:fixed, z-index:1000).
 *  - Samples the word "stipple" from an offscreen canvas using the loaded font.
 *  - Drives all animation with anime.js v4 (createTimeline).
 *  - Reads the home demo stage's real rect so the handoff grid lands exactly
 *    on the DotEngine dots with zero jump.
 *  - After handoff the canvas is removed; the DotEngine takes over with its own
 *    RAF loop (pointer wake + click shockwave).
 *
 * Exact numbers: REFERENCE.md § "Intro (boot sequence)".
 */

import { useEffect, useRef } from 'react'
import { createTimeline, animate } from 'animejs'
import type { Timeline } from 'animejs'
import styles from './intro-overlay.module.css'

const WORD = 'stipple'

// Dark-theme dot colors by letter index modulo 5 (REFERENCE.md)
const LETTER_COLORS = [
  '#9A7BFF', // 0 s  — violet
  '#FF5C9A', // 1 t  — pink
  '#FFB33D', // 2 i  — amber
  '#3DDC97', // 3 p  — green
  '#4CC9FF', // 4 p  — sky
  '#9A7BFF', // 5 l  — violet
  '#FF5C9A', // 6 e  — pink
] as const

// Session key
const SESSION_KEY = 'stipple:intro-played'

// ─── Dot state (plain objects, animated as JS numbers) ───────────────────────

interface IntroDot {
  // bezier start / ctrl / target
  sx: number; sy: number
  cpx: number; cpy: number
  tx: number; ty: number
  // animation progress t ∈ [0,1] along the bezier
  t: number
  // opacity a ∈ [0,1]
  a: number
  // handoff progress h ∈ [0,1]
  h: number
  // fill color
  col: string
  // dot radius
  r: number
  // grid destination (240 picked dots)
  gx: number | null; gy: number | null; gr: number
  // scatter destination (remaining dots)
  ox: number; oy: number
}

// ─── Sampling ─────────────────────────────────────────────────────────────────

function sample(
  W: number,
  H: number,
  maxPts: number
): { pts: [number, number, number][]; gap: number } {
  const off = document.createElement('canvas')
  off.width = W
  off.height = H
  const g = off.getContext('2d')!

  // Size the word to 70% of width, max 50% of height
  g.font = '600 100px var(--font-sans, "Familjen Grotesk", system-ui, sans-serif)'
  const measure = g.measureText(WORD).width
  const fs = Math.min((100 * (W * 0.7)) / measure, H * 0.5)
  g.font = `600 ${fs}px var(--font-sans, "Familjen Grotesk", system-ui, sans-serif)`
  g.textBaseline = 'middle'
  g.fillStyle = '#fff'

  const tw = g.measureText(WORD).width
  const x0 = (W - tw) / 2

  // Cumulative widths per letter (to map x → letter index)
  const pre: number[] = []
  for (let i = 0; i < WORD.length; i++) {
    pre.push(g.measureText(WORD.slice(0, i + 1)).width)
  }

  g.fillText(WORD, x0, H / 2)

  const px = g.getImageData(0, 0, W, H).data
  let gap = Math.max(5, Math.round(fs / 42))
  let pts: [number, number, number][]

  for (;;) {
    pts = []
    for (let y = 0; y < H; y += gap) {
      for (let x = 0; x < W; x += gap) {
        if (px[(y * W + x) * 4 + 3] > 128) {
          const lIdx = pre.findIndex((w) => x - x0 < w)
          pts.push([x, y, lIdx < 0 ? 6 : lIdx])
        }
      }
    }
    if (pts.length <= maxPts) break
    gap++
  }

  return { pts, gap }
}

// ─── Dot building ─────────────────────────────────────────────────────────────

function rnd(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo)
}

function buildDots(
  pts: [number, number, number][],
  gap: number,
  W: number,
  H: number,
  stageRect: DOMRect | null
): IntroDot[] {
  // Compute grid destination from real stage rect (REFERENCE.md — zero-jump)
  let gx0: number, gy0: number, P: number, gridRadius: number

  if (stageRect) {
    const sW = stageRect.width
    const sH = stageRect.height
    P = Math.min(sW / 25, sH / 13)
    const baseS = Math.max(6, Math.min(12, Math.round(sW / 90)))
    const s = Math.min(baseS, Math.max(4, 0.8 * P))
    gridRadius = s / 2
    // cx/cy of the stage in viewport coords
    const sCx = stageRect.left + sW / 2
    const sCy = stageRect.top + sH / 2 - 8
    gx0 = sCx - 11.5 * P
    gy0 = sCy - 4.5 * P
  } else {
    // Fallback: prototype position (H * 0.66)
    P = Math.min(W / 26, H * 0.5 / 11)
    gridRadius = Math.max(3, Math.min(6, W / 180))
    gx0 = W / 2 - 11.5 * P
    gy0 = H * 0.66 - 4.5 * P
  }

  const dotR = gap * 0.36

  // Pick 240 random indices for the grid
  const pick = new Set<number>()
  while (pick.size < Math.min(240, pts.length)) {
    pick.add(Math.floor(Math.random() * pts.length))
  }
  let k = 0

  return pts.map((p, i) => {
    const [tx, ty, letterIdx] = p
    const col = LETTER_COLORS[letterIdx % LETTER_COLORS.length]

    const sx = rnd(-0.1 * W, 1.1 * W)
    const sy = rnd(-0.1 * H, 1.1 * H)

    // Curved control point: perpendicular offset up to 25% of distance
    const angle = Math.atan2(ty - sy, tx - sx) + Math.PI / 2
    const dist = Math.hypot(tx - sx, ty - sy)
    const offset = rnd(-0.25, 0.25) * dist
    const cpx = (sx + tx) / 2 + Math.cos(angle) * offset
    const cpy = (sy + ty) / 2 + Math.sin(angle) * offset

    // Grid destination
    let gxDot: number | null = null
    let gyDot: number | null = null
    let gr = gridRadius
    let ox = 0, oy = 0

    if (pick.has(i)) {
      const n = k++
      gxDot = gx0 + (n % 24) * P
      gyDot = gy0 + Math.floor(n / 24) * P
    } else {
      const an = Math.atan2(ty - H / 2, tx - W / 2)
      ox = Math.cos(an) * rnd(200, 500)
      oy = Math.sin(an) * rnd(200, 500)
    }

    return {
      sx, sy, cpx, cpy, tx, ty,
      t: 0, a: 0, h: 0,
      col, r: dotR,
      gx: gxDot, gy: gyDot, gr,
      ox, oy,
    }
  })
}

// ─── Draw loop ────────────────────────────────────────────────────────────────

interface Ring { x: number; y: number; r: number; amp: number }

function drawFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  dots: IntroDot[],
  rings: Ring[]
): void {
  ctx.clearRect(0, 0, W, H)

  for (const d of dots) {
    // Bezier position
    const u = 1 - d.t
    let x = u * u * d.sx + 2 * u * d.t * d.cpx + d.t * d.t * d.tx
    let y = u * u * d.sy + 2 * u * d.t * d.cpy + d.t * d.t * d.ty
    let r = d.r
    let al = d.a

    // Handoff blend
    if (d.h > 0) {
      if (d.gx !== null && d.gy !== null) {
        x += (d.gx - x) * d.h
        y += (d.gy - y) * d.h
        r += (d.gr - r) * d.h
      } else {
        x += d.ox * d.h
        y += d.oy * d.h
        al *= 1 - d.h
      }
    }

    // Shockwave ring displacement
    for (const q of rings) {
      const dx = x - q.x
      const dy = y - q.y
      const di = Math.hypot(dx, dy) || 1
      const k = di - q.r
      if (Math.abs(k) < 70) {
        const f = Math.cos((k / 70) * (Math.PI / 2)) * q.amp
        x += (dx / di) * f
        y += (dy / di) * f
      }
    }

    const actualR = Math.max(r, 0.1)
    if (al < 0.01) continue

    ctx.globalAlpha = Math.max(0, Math.min(1, al))
    ctx.fillStyle = d.col
    ctx.beginPath()
    ctx.arc(x, y, actualR, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.globalAlpha = 1
}

// ─── Component ────────────────────────────────────────────────────────────────

interface IntroOverlayProps {
  /** ref to the home-page demo stage container (used to get real rect for handoff) */
  stageRef: React.RefObject<HTMLDivElement | null>
  /** ref to the home headline element (animated in during handoff) */
  headlineRef: React.RefObject<HTMLElement | null>
  /** called when the intro is done so the parent can show the real stage */
  onDone: () => void
}

export function IntroOverlay({ stageRef, headlineRef, onDone }: IntroOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const skipRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    if (!canvas || !overlay) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // ── Reduced motion: short wordmark fade only ──────────────────────────────
    if (reducedMotion) {
      const wm = document.createElement('div')
      wm.className = styles.wordmarkFade
      const txt = document.createElement('p')
      txt.className = styles.wordmark
      txt.textContent = 'stipple'
      wm.appendChild(txt)
      document.body.appendChild(wm)

      animate(txt, { opacity: [0, 1], duration: 150, ease: 'linear' })
      animate(txt, { opacity: [1, 0], duration: 150, ease: 'linear', delay: 150,
        onComplete: () => {
          wm.remove()
          onDone()
        }
      })
      return
    }

    // ── Session check ─────────────────────────────────────────────────────────
    const forceIntro = new URLSearchParams(window.location.search).get('intro') === '1'
    if (!forceIntro && sessionStorage.getItem(SESSION_KEY) === '1') {
      onDone()
      return
    }

    // ── Canvas setup ──────────────────────────────────────────────────────────
    const W = window.innerWidth
    const H = window.innerHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Quality tier check – Low ≤ 600 dots, no shockwave
    const isLowTier = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const maxPts = isLowTier ? 600 : 2400

    // ── Wait for font then sample ─────────────────────────────────────────────
    let rafId: number
    let timeline: Timeline | null = null
    let dots: IntroDot[] = []
    const rings: Ring[] = []
    let isDone = false

    // Get real stage rect for zero-jump handoff
    const stageRect = stageRef.current
      ? stageRef.current.getBoundingClientRect()
      : null

    function triggerShockwave(x: number, y: number, amp: number, maxR: number, dur: number) {
      if (isLowTier) return
      const ring: Ring = { x, y, r: 0, amp }
      rings.push(ring)
      animate(ring, {
        r: maxR,
        amp: 0,
        duration: dur,
        ease: 'outQuad',
        onComplete: () => {
          const idx = rings.indexOf(ring)
          if (idx !== -1) rings.splice(idx, 1)
        },
      })
    }

    function loop() {
      drawFrame(ctx, W, H, dots, rings)
      rafId = requestAnimationFrame(loop)
    }

    function finish() {
      if (isDone) return
      isDone = true
      sessionStorage.setItem(SESSION_KEY, '1')
      if (skipRef.current) skipRef.current.classList.add(styles.skipHidden)
      // Small delay to let the handoff frame render, then remove overlay
      setTimeout(() => {
        cancelAnimationFrame(rafId)
        overlay.remove()
        onDone()
      }, 60)
    }

    // Skip handler: jump to end of timeline in 300 ms (REFERENCE.md)
    let skipThrottled = false
    function handleSkip() {
      if (isDone || skipThrottled) return
      skipThrottled = true
      if (timeline) {
        // Force all dots to their final handoff state, then animate bg out quickly
        for (const d of dots) { d.h = 1 }
        // Animate the overlay bg to transparent in 300 ms
        const bgEl = overlayRef.current?.querySelector<HTMLElement>(`.${styles.overlayBg}`)
        if (bgEl) {
          animate(bgEl, { opacity: 0, duration: 300, ease: 'linear', onComplete: finish })
        } else {
          finish()
        }
        timeline.pause()
        // Also show headline immediately
        if (headlineRef.current) {
          headlineRef.current.style.opacity = '1'
          headlineRef.current.style.transform = 'none'
        }
      }
    }

    const skipEvents = ['pointerdown', 'keydown', 'wheel', 'touchmove'] as const
    function addSkipListeners() {
      for (const ev of skipEvents) {
        window.addEventListener(ev, handleSkip, { once: true, passive: true })
      }
    }
    function removeSkipListeners() {
      for (const ev of skipEvents) {
        window.removeEventListener(ev, handleSkip)
      }
    }

    function startIntro() {
      const { pts, gap } = sample(W, H, maxPts)
      dots = buildDots(pts, gap, W, H, stageRect)

      const maxD = Math.hypot(W, H) / 2

      // Hide headline so it can rise in during handoff
      if (headlineRef.current) {
        headlineRef.current.style.opacity = '0'
        headlineRef.current.style.transform = 'translateY(40px)'
      }

      // Start RAF before timeline so first frame paints immediately
      rafId = requestAnimationFrame(loop)
      addSkipListeners()

      // Build anime.js v4 timeline
      // REFERENCE.md timeline (ms):
      //  0–700   scatter  (fade-in at start positions)
      //  400–1750 gather  (bezier fly to letters)
      //  1800     shockwave from center
      //  2400–3250 handoff (grid + scatter + bg fade)
      //  2700–3400 headline rise
      timeline = createTimeline({ defaults: { ease: 'outExpo' } })

      // [scatter] fade in
      timeline.add(
        dots,
        {
          a: 1,
          duration: 400,
          ease: 'linear',
          delay: () => rnd(0, 300),
        },
        0
      )

      // [gather] bezier fly left-to-right
      timeline.add(
        dots,
        {
          t: 1,
          duration: 1000,
          ease: 'outElastic(1, 0.85)',
          delay: (d: IntroDot) => (d.tx / W) * 350,
        },
        400
      )

      // [shockwave] fire from center at 1800 ms
      const shockTrigger = { _v: 0 }
      timeline.add(
        shockTrigger,
        {
          _v: 1,
          duration: 10,
          onBegin: () => triggerShockwave(W / 2, H / 2, 14, maxD, 600),
        },
        1800
      )

      // [handoff] move to grid / scatter outward
      timeline.add(
        dots,
        {
          h: 1,
          duration: 650,
          ease: 'inOutExpo',
          delay: (d: IntroDot) =>
            (Math.hypot(d.tx - W / 2, d.ty - H / 2) / maxD) * 200,
        },
        2400
      )

      // [handoff] background fade
      const bgEl = overlayRef.current?.querySelector<HTMLElement>(`.${styles.overlayBg}`)
      if (bgEl) {
        timeline.add(bgEl, { opacity: 0, duration: 650, ease: 'inOutExpo' }, 2400)
      }

      // [headline] rise in
      if (headlineRef.current) {
        timeline.add(
          headlineRef.current,
          {
            opacity: [0, 1],
            translateY: [40, 0],
            duration: 700,
            ease: 'outExpo',
          },
          2700
        )
      }

      // Done: clean up and remove overlay
      timeline.then(() => {
        removeSkipListeners()
        finish()
      })
    }

    // Wait for font (up to 1200 ms), then start
    Promise.race([
      document.fonts.load('600 100px var(--font-sans, "Familjen Grotesk")'),
      new Promise<void>((r) => setTimeout(r, 1200)),
    ])
      .catch(() => {})
      .then(() => startIntro())

    // Pause/resume when tab is hidden (REFERENCE.md)
    function handleVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(rafId)
        timeline?.pause()
      } else {
        rafId = requestAnimationFrame(loop)
        timeline?.play()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelAnimationFrame(rafId)
      timeline?.pause()
      removeSkipListeners()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [stageRef, headlineRef, onDone])

  return (
    <div ref={overlayRef} className={styles.overlay} aria-hidden="true">
      {/* Dark background div – faded out during handoff */}
      <div className={styles.overlayBg} />
      <canvas ref={canvasRef} className={styles.canvas} />
      <p ref={skipRef} className={styles.skip}>
        Click, press any key or scroll to skip.
      </p>
      {/* Accessible status for screen readers */}
      <span className={styles.srOnly} role="status">
        Loading Stipple
      </span>
    </div>
  )
}
