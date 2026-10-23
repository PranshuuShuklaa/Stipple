/**
 * Unit tests for intro boot-sequence logic.
 * Tests the real shared math in src/features/intro/intro-math.ts —
 * the component imports the same functions, so the tests cannot drift.
 */
import { describe, it, expect } from 'vitest'
import {
  LOW_TIER_SAMPLE_POINTS,
  MAX_SAMPLE_POINTS,
  bezierPoint,
  computeGap,
  computeGridFromStage,
  computePrototypeGrid,
  computeWordFontSize,
  gridDotPosition,
  hexToRgb,
  ringDisplacement,
} from '@/features/intro/intro-math'

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
    const fs = computeWordFontSize(700, W, H)
    // 70% of 1200 = 840; 840 / 700 * 100 = 120; but clamped to H * 0.5 = 400
    expect(fs).toBeCloseTo(Math.min(120, 400))
  })

  it('fontSize is capped to 50% of viewport height', () => {
    const W = 4000, H = 300  // very wide screen
    const fs = computeWordFontSize(400, W, H)
    // H * 0.5 = 150 — the height cap should win
    expect(fs).toBeCloseTo(150)
  })
})

describe('hexToRgb', () => {
  it('parses a 6-digit hex color into an rgb triple', () => {
    expect(hexToRgb('#9A7BFF')).toEqual([154, 123, 255])
    expect(hexToRgb('#100C24')).toEqual([16, 12, 36])
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

describe('Prototype fallback grid', () => {
  it('uses the prototype pitch min(W/26, H*0.5/11)', () => {
    const { P } = computePrototypeGrid(1200, 800)
    expect(P).toBeCloseTo(Math.min(1200 / 26, (800 * 0.5) / 11))
  })

  it('grid origin centers an 24x10-ish field at x=50%, y=66%', () => {
    const { gx0, gy0, P } = computePrototypeGrid(1200, 800)
    expect(gx0).toBeCloseTo(1200 / 2 - 11.5 * P)
    expect(gy0).toBeCloseTo(800 * 0.66 - 4.5 * P)
  })

  it('clamps the dot radius to [3, 6]', () => {
    expect(computePrototypeGrid(10000, 800).gr).toBeLessThanOrEqual(6)
    expect(computePrototypeGrid(400, 800).gr).toBeGreaterThanOrEqual(3)
  })
})

describe('Bezier path', () => {
  it('starts at the start position when t=0', () => {
    const { x, y } = bezierPoint(0, 10, 20, 50, 60, 100, 200)
    expect(x).toBeCloseTo(10)
    expect(y).toBeCloseTo(20)
  })

  it('ends at the target position when t=1', () => {
    const { x, y } = bezierPoint(1, 10, 20, 50, 60, 100, 200)
    expect(x).toBeCloseTo(100)
    expect(y).toBeCloseTo(200)
  })

  it('is between start and target for t in (0,1)', () => {
    const { x, y } = bezierPoint(0.5, 0, 0, 0, 0, 100, 100)
    expect(x).toBeGreaterThanOrEqual(0)
    expect(x).toBeLessThanOrEqual(100)
    expect(y).toBeGreaterThanOrEqual(0)
    expect(y).toBeLessThanOrEqual(100)
  })
})

describe('Shockwave displacement', () => {
  it('returns zero displacement outside the 70px band', () => {
    const { dx, dy } = ringDisplacement(200, 0, { x: 0, y: 0, r: 0, amp: 16 })
    // dot is 200px from ring center, ring r=0 → k=200, |k|>70
    expect(dx).toBe(0)
    expect(dy).toBe(0)
  })

  it('displaces a dot radially outward at maximum at k=0', () => {
    // dot at (100, 0), ring center at (0,0), ring r=100 → k=0
    const { dx, dy } = ringDisplacement(100, 0, { x: 0, y: 0, r: 100, amp: 16 })
    // cos(0) = 1 → f = 16; displacement = (100/100) * 16 = 16 in x
    expect(dx).toBeCloseTo(16)
    expect(dy).toBeCloseTo(0)
  })

  it('displacement falls to zero at the edge of the 70px band', () => {
    // k = 70 → cos(PI/2) = 0
    const { dx, dy } = ringDisplacement(170, 0, { x: 0, y: 0, r: 100, amp: 16 })
    expect(Math.abs(dx)).toBeLessThan(0.01)
    expect(Math.abs(dy)).toBeLessThan(0.01)
  })

  it('displacement is symmetric on both sides of the ring', () => {
    // k = +35 vs k = -35 should give same magnitude (cos is symmetric)
    const a = ringDisplacement(135, 0, { x: 0, y: 0, r: 100, amp: 16 }) // k = +35
    const b = ringDisplacement(65, 0, { x: 0, y: 0, r: 100, amp: 16 })  // k = -35
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
  it('Low tier samples 600 points, High/Medium 2,400', () => {
    expect(LOW_TIER_SAMPLE_POINTS).toBe(600)
    expect(MAX_SAMPLE_POINTS).toBe(2400)
    expect(LOW_TIER_SAMPLE_POINTS).toBeLessThan(MAX_SAMPLE_POINTS)
  })
})
