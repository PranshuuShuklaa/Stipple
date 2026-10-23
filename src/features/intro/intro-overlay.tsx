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
import type { Timeline, Target } from 'animejs'
import type { QualityTier } from '@/engine/quality'
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

// The engine's Files grid alpha (layouts/files.ts) — the handoff target
const FILES_ALPHA = 0.85

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
  // fill color as [r, g, b]
  col: [number, number, number]
  // engine Files-grid color the grid dots fade into during handoff
  fileColor: [number, number, number]
  // dot radius
  r: number
  // grid destination (240 picked dots)
  gx: number | null; gy: number | null; gr: number
  // scatter destination (remaining dots)
  ox: number; oy: number
}

// ─── Sampling ─────────────────────────────────────────────────────────────────

/**
 * Resolves the page's real font-family from computed style. next/font generates
 * a hashed family name exposed through --font-sans, and neither the canvas font
 * shorthand nor document.fonts.load() can use var() — the literal computed list
 * is required for both.
 */
function resolveCanvasFontFamily(): string {
  const computed = getComputedStyle(document.body).fontFamily
  return computed.trim() || 'sans-serif'
}

function sample(
  W: number,
  H: number,
  maxPts: number,
  fontFamily: string
): { pts: [number, number, number][]; gap: number } {
  const off = document.createElement('canvas')
  off.width = W
  off.height = H
  const g = off.getContext('2d')!

  // Size the word to 70% of width, max 50% of height
  g.font = `600 100px ${fontFamily}`
  const measure = g.measureText(WORD).width
  const fs = Math.min((100 * (W * 0.7)) / measure, H * 0.5)
  g.font = `600 ${fs}px ${fontFamily}`
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

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

/**
 * The engine renders Files dots in the page's current-theme fg color
 * (tokens.css → --fg → body color), so the handoff target is body.color.
 */
function resolveFilesColor(): [number, number, number] {
  const m = getComputedStyle(document.body).color
    .match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/)
  return m
    ? [Math.round(Number(m[1])), Math.round(Number(m[2])), Math.round(Number(m[3]))]
    : hexToRgb(LETTER_COLORS[0])
}

function buildDots(
  pts: [number, number, number][],
  gap: number,
  W: number,
  H: number,
  stageRect: DOMRect | null,
  filesColor: [number, number, number]
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
    const col = hexToRgb(LETTER_COLORS[letterIdx % LETTER_COLORS.length])

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
    const gr = gridRadius
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
      col,
      // Grid dots fade into the engine Files color; scatter dots ignore it
      fileColor: gxDot !== null ? filesColor : col,
      r: dotR,
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

    // Blended fill color (letter color; grid dots fade the letter color out)
    let cr = d.col[0]
    let cg = d.col[1]
    let cb = d.col[2]

    // Handoff blend
    if (d.h > 0) {
      if (d.gx !== null && d.gy !== null) {
        x += (d.gx - x) * d.h
        y += (d.gy - y) * d.h
        r += (d.gr - r) * d.h
        // Color and alpha fade into the engine's Files look (theme fg, 0.85)
        // so the overlay's last frame matches the engine's first frame 1:1
        al += (FILES_ALPHA - al) * d.h
        cr += (d.fileColor[0] - cr) * d.h
        cg += (d.fileColor[1] - cg) * d.h
        cb += (d.fileColor[2] - cb) * d.h
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
    ctx.fillStyle = `rgb(${Math.round(cr)}, ${Math.round(cg)}, ${Math.round(cb)})`
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
  /** reads the mounted DotEngine's current quality tier (Low = 600 dots, no shockwave) */
  getTier?: () => QualityTier | null
}

export function IntroOverlay({ stageRef, headlineRef, onDone, getTier }: IntroOverlayProps) {
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

    // ── Wait for font then sample ─────────────────────────────────────────────
    let rafId: number
    let timeline: Timeline | null = null
    let dots: IntroDot[] = []
    const rings: Ring[] = []
    let isDone = false

    // The literal computed family list (next/font uses a generated name)
    const fontFamily = resolveCanvasFontFamily()

    function triggerShockwave(x: number, y: number, amp: number, maxR: number, dur: number) {
      // The engine is the tier authority; re-read it live (its 60-frame
      // measurement usually completes during the intro's first half)
      if (getTier?.()?.name === 'low') return
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
      // Small delay to let the handoff frame render. Do NOT detach the
      // overlay from the DOM here: React owns this node (the page renders it
      // conditionally) and a manual .remove() breaks React's own unmount
      // with "removeChild: The node to be removed is not a child of this
      // node". onDone flips the parent state and React unmounts it cleanly.
      setTimeout(() => {
        cancelAnimationFrame(rafId)
        onDone()
      }, 60)
    }

    // Skip: click, tap, Escape, any key or scroll jumps straight to the
    // handoff end state; the overlay background then fades out in 300 ms
    let skipRequested = false
    function skipToFinishedState() {
      if (!timeline) return
      timeline.pause()
      // Force all dots to their final handoff state, then fade the bg quickly
      for (const d of dots) { d.h = 1 }
      const bgEl = overlayRef.current?.querySelector<HTMLElement>(`.${styles.overlayBg}`)
      if (bgEl) {
        animate(bgEl, { opacity: 0, duration: 300, ease: 'linear', onComplete: finish })
      } else {
        finish()
      }
      // Show the headline immediately
      if (headlineRef.current) {
        headlineRef.current.style.opacity = '1'
        headlineRef.current.style.transform = 'none'
      }
    }
    function handleSkip() {
      if (isDone) return
      skipRequested = true
      // Detach every skip listener: one skip is one skip
      removeSkipListeners()
      if (timeline) {
        skipToFinishedState()
      }
      // Timeline not built yet (font wait): startIntro consumes skipRequested
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
      // The engine is the quality-tier authority: Low caps the word sampling
      // at 600 dots (High/Medium use up to 2,400). If the engine has not
      // finished its 60-frame measurement yet it still reports High; the
      // shockwave check re-reads the tier live at 1800 ms.
      const maxPts = getTier?.()?.name === 'low' ? 600 : 2400
      // Read the demo stage's real rect here (lazy): the intro's effect runs
      // before DotStage's sibling effect, but this runs at least one task
      // later (after the font wait), so the reported element exists by then.
      // Falls back to the prototype geometry if the stage is not available.
      const stageRect = stageRef.current?.getBoundingClientRect() ?? null
      const { pts, gap } = sample(W, H, maxPts, fontFamily)
      const filesColor = resolveFilesColor()
      dots = buildDots(pts, gap, W, H, stageRect, filesColor)

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
          // anime.js v4 function-based value: (target, index, targets)
          delay(target?: Target) {
            const dot = target as unknown as IntroDot | undefined
            return ((dot?.tx ?? 0) / W) * 350
          },
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
          // anime.js v4 function-based value: (target, index, targets)
          delay(target?: Target) {
            const dot = target as unknown as IntroDot | undefined
            return (
              (Math.hypot((dot?.tx ?? 0) - W / 2, (dot?.ty ?? 0) - H / 2) / maxD) * 200
            )
          },
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

      // A skip that arrived during the font wait: jump to the end now
      if (skipRequested) {
        skipRequested = false
        skipToFinishedState()
      }
    }

    // Wait for font (up to 1200 ms), then start
    Promise.race([
      document.fonts.load(`600 100px ${fontFamily}`),
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
  }, [stageRef, headlineRef, onDone, getTier])

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
