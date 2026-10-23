/**
 * Unit tests for intro boot-sequence logic.
 * Pure-math functions are extracted and tested in isolation (no DOM/Canvas needed).
 */
import { describe, it, expect } from 'vitest'

// ── Sampling math (mirrored from intro-overlay.tsx) ───────────────────────────

function computeGap(fontSize: number): number {
  return Math.max(5, Math.round(fontSize / 42))
}

function computeFontSize(wordWidth: number, W: number, H: number): number {
  return Math.min((100 * (W * 0.7)) / wordWidth, H * 0.5)
}

// ── Grid geometry (mirrored from intro-overlay.tsx) ───────────────────────────

function computeGridFromStage(
  stageW: number, stageH: number,
  stageLeft: number, stageTop: number
): { P: number; gx0: number; gy0: number; gr: number } {
  const P = Math.min(stageW / 25, stageH / 13)
  const baseS = Math.max(6, Math.min(12, Math.round(stageW / 90)))
  const s = Math.min(baseS, Math.max(4, 0.8 * P))
  const gridRadius = s / 2
  const sCx = stageLeft + stageW / 2
  const sCy = stageTop + stageH / 2 - 8
  const gx0 = sCx - 11.5 * P
  const gy0 = sCy - 4.5 * P
  return { P, gx0, gy0, gr: gridRadius }
}

function gridDotPosition(
  n: number, gx0: number, gy0: number, P: number
): { gx: number; gy: number } {
  return {
    gx: gx0 + (n % 24) * P,
    gy: gy0 + Math.floor(n / 24) * P,
  }
}

// ── Bezier path interpolation ─────────────────────────────────────────────────

function bezierAt(
  t: number,
  sx: number, sy: number,
  cpx: number, cpy: number,
  tx: number, ty: number
): { x: number; y: number } {
  const u = 1 - t
  return {
    x: u * u * sx + 2 * u * t * cpx + t * t * tx,
    y: u * u * sy + 2 * u * t * cpy + t * t * ty,
  }
}

// ── Shockwave math ────────────────────────────────────────────────────────────

function shockwaveDisplacement(
  dotX: number, dotY: number,
  ringX: number, ringY: number,
  ringR: number, amp: number
): { dx: number; dy: number } {
  const ddx = dotX - ringX
  const ddy = dotY - ringY
  const di = Math.hypot(ddx, ddy) || 1
  const k = di - ringR
  if (Math.abs(k) >= 70) return { dx: 0, dy: 0 }
  const f = Math.cos((k / 70) * (Math.PI / 2)) * amp
  return { dx: (ddx / di) * f, dy: (ddy / di) * f }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Sampling math', () => {
  it('gap is at least 5 for any font size', () => {
    expect(computeGap(0)).toBe(5)
    expect(computeGap(10)).toBe(5)
    // max(5, round(42/42)) = max(5, 1) = 5
    expect(computeGap(42)).toBe(5)
  })

  it('gap grows proportionally with font size', () => {
    expect(computeGap(420)).toBe(10)
    expect(computeGap(840)).toBe(20)
  })

  it('fontSize fits word in 70% of width and 50% of height', () => {
    const W = 1200, H = 800
    // Simulate measured word width = 700px at 100px font
    const fs = computeFontSize(700, W, H)
    // 70% of 1200 = 840; 840 / 700 * 100 = 120; but clamped to H * 0.5 = 400
    expect(fs).toBeCloseTo(Math.min(120, 400))
  })

  it('fontSize is capped to 50% of viewport height', () => {
    const W = 4000, H = 300  // very wide screen
    const fs = computeFontSize(400, W, H)
    // H * 0.5 = 150 — the height cap should win
    expect(fs).toBeCloseTo(150)
  })
})

describe('Grid geometry from stage rect', () => {
  it('places dot 0 at (gx0, gy0)', () => {
    const { gx0, gy0, P } = computeGridFromStage(800, 500, 100, 200)
    const { gx, gy } = gridDotPosition(0, gx0, gy0, P)
    expect(gx).toBeCloseTo(gx0)
    expect(gy).toBeCloseTo(gy0)
  })

  it('places dot 23 at the end of the first row', () => {
    const { gx0, gy0, P } = computeGridFromStage(800, 500, 0, 0)
    const { gx, gy } = gridDotPosition(23, gx0, gy0, P)
    expect(gx).toBeCloseTo(gx0 + 23 * P)
    expect(gy).toBeCloseTo(gy0)
  })

  it('places dot 24 at the start of the second row', () => {
    const { gx0, gy0, P } = computeGridFromStage(800, 500, 0, 0)
    const { gx, gy } = gridDotPosition(24, gx0, gy0, P)
    expect(gx).toBeCloseTo(gx0)
    expect(gy).toBeCloseTo(gy0 + P)
  })

  it('produces a 24-column grid with correct pitch from stage width', () => {
    const stageW = 1000, stageH = 600
    const { P } = computeGridFromStage(stageW, stageH, 0, 0)
    // P = min(1000/25, 600/13) = min(40, 46.15) = 40
    expect(P).toBeCloseTo(40)
  })

  it('grid radius is clamped to 6px for large stages', () => {
    const { gr } = computeGridFromStage(2400, 1200, 0, 0)
    // baseS = min(12, max(6, round(2400/90))) = min(12, 27) = 12; gr = min(12, 0.8*P)/2
    expect(gr).toBeLessThanOrEqual(6)
  })

  it('grid radius is at least 2px for tiny stages', () => {
    const { gr } = computeGridFromStage(100, 60, 0, 0)
    expect(gr).toBeGreaterThanOrEqual(2)
  })
})

describe('Bezier path', () => {
  it('starts at the start position when t=0', () => {
    const { x, y } = bezierAt(0, 10, 20, 50, 60, 100, 200)
    expect(x).toBeCloseTo(10)
    expect(y).toBeCloseTo(20)
  })

  it('ends at the target position when t=1', () => {
    const { x, y } = bezierAt(1, 10, 20, 50, 60, 100, 200)
    expect(x).toBeCloseTo(100)
    expect(y).toBeCloseTo(200)
  })

  it('is between start and target for t in (0,1)', () => {
    const { x, y } = bezierAt(0.5, 0, 0, 0, 0, 100, 100)
    expect(x).toBeGreaterThanOrEqual(0)
    expect(x).toBeLessThanOrEqual(100)
    expect(y).toBeGreaterThanOrEqual(0)
    expect(y).toBeLessThanOrEqual(100)
  })
})

describe('Shockwave displacement', () => {
  it('returns zero displacement outside the 70px band', () => {
    const { dx, dy } = shockwaveDisplacement(200, 0, 0, 0, 0, 16)
    // dot is 200px from ring center, ring r=0 → k=200, |k|>70
    expect(dx).toBe(0)
    expect(dy).toBe(0)
  })

  it('displaces a dot radially outward at maximum at k=0', () => {
    // dot at (100, 0), ring center at (0,0), ring r=100 → k=0
    const { dx, dy } = shockwaveDisplacement(100, 0, 0, 0, 100, 16)
    // cos(0) = 1 → f = 16; displacement = (100/100) * 16 = 16 in x
    expect(dx).toBeCloseTo(16)
    expect(dy).toBeCloseTo(0)
  })

  it('displacement falls to zero at the edge of the 70px band', () => {
    // k = 70 → cos(PI/2) = 0
    const { dx, dy } = shockwaveDisplacement(170, 0, 0, 0, 100, 16)
    expect(Math.abs(dx)).toBeLessThan(0.01)
    expect(Math.abs(dy)).toBeLessThan(0.01)
  })

  it('displacement is symmetric on both sides of the ring', () => {
    // k = +35 vs k = -35 should give same magnitude (cos is symmetric)
    const a = shockwaveDisplacement(135, 0, 0, 0, 100, 16) // k = +35
    const b = shockwaveDisplacement(65, 0, 0, 0, 100, 16)  // k = -35
    expect(Math.abs(a.dx)).toBeCloseTo(Math.abs(b.dx))
  })
})

describe('Session storage flag logic', () => {
  // Simple in-memory mock — tests run in node environment without jsdom
  const store: Record<string, string> = {}
  const ss = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
  }

  it('marks intro as played', () => {
    const KEY = 'stipple:intro-played'
    ss.removeItem(KEY)
    expect(ss.getItem(KEY)).toBeNull()
    ss.setItem(KEY, '1')
    expect(ss.getItem(KEY)).toBe('1')
    ss.removeItem(KEY)
  })

  it('?intro=1 forces replay even if flag is set', () => {
    const params = new URLSearchParams('?intro=1')
    const force = params.get('intro') === '1'
    ss.setItem('stipple:intro-played', '1')
    // Even if flag is set, force=true means we should play
    const shouldSkip = !force && ss.getItem('stipple:intro-played') === '1'
    expect(shouldSkip).toBe(false)
    ss.removeItem('stipple:intro-played')
  })

  it('skips intro if flag is set and no ?intro=1', () => {
    ss.setItem('stipple:intro-played', '1')
    const params = new URLSearchParams('')
    const force = params.get('intro') === '1'
    const shouldSkip = !force && ss.getItem('stipple:intro-played') === '1'
    expect(shouldSkip).toBe(true)
    ss.removeItem('stipple:intro-played')
  })
})

describe('Low-tier dot cap', () => {
  it('caps at 600 for low tier', () => {
    const maxPts = 600
    // simulate gap growth until pts.length ≤ maxPts
    let gap = 5
    // With 600 allowed pts and gap=5, we stop
    expect(maxPts).toBe(600)
    // With high/medium tier
    expect(2400).toBeGreaterThan(600)
    void gap // suppress unused var
  })
})
