import { describe, it, expect } from 'vitest'
import {
  FORGE_PITCH,
  MAX_FORGE_DOTS,
  buildCollapseTargets,
  buildForgeGeometry,
  insidePill,
  type ForgeRect,
} from '@/features/share/link-forge-math'

const BADGE: ForgeRect = { x: 366, y: 200, width: 268, height: 40 }
const CANVAS = { width: 1000, height: 900 }
const FRAME: ForgeRect = {
  x: BADGE.x - 14,
  y: BADGE.y - 14,
  width: BADGE.width + 28,
  height: BADGE.height + 28,
}

function isFinitePoint(point: { x: number; y: number }): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

describe('buildForgeGeometry', () => {
  it('frames the badge with a pill of dots', () => {
    const geometry = buildForgeGeometry(BADGE, CANVAS)

    expect(geometry.dots.length).toBeGreaterThan(40)
    expect(geometry.dots.length).toBeLessThanOrEqual(MAX_FORGE_DOTS)
    expect(geometry.cols).toBeGreaterThan(1)
    expect(geometry.rows).toBeGreaterThan(1)

    for (const dot of geometry.dots) {
      expect(isFinitePoint(dot.target)).toBe(true)
      expect(insidePill(dot.target.x, dot.target.y, FRAME, FRAME.height / 2)).toBe(
        true,
      )
    }
  })

  it('never puts a dot over the badge text', () => {
    const geometry = buildForgeGeometry(BADGE, CANVAS)

    for (const dot of geometry.dots) {
      const outside =
        dot.target.x < BADGE.x - 1 ||
        dot.target.x > BADGE.x + BADGE.width + 1 ||
        dot.target.y < BADGE.y - 1 ||
        dot.target.y > BADGE.y + BADGE.height + 1
      expect(outside).toBe(true)
    }
  })

  it('splits label and score-band colors at the badge midpoint', () => {
    const geometry = buildForgeGeometry(BADGE, CANVAS)
    const splitX = BADGE.x + BADGE.width * 0.48

    expect(geometry.dots.some((dot) => dot.color === 'label')).toBe(true)
    expect(geometry.dots.some((dot) => dot.color === 'band')).toBe(true)
    for (const dot of geometry.dots) {
      expect(dot.target.x <= splitX ? 'label' : 'band').toBe(dot.color)
    }
  })

  it('is deterministic for a seed and only scatters change with another', () => {
    const first = buildForgeGeometry(BADGE, CANVAS, 17)
    const same = buildForgeGeometry(BADGE, CANVAS, 17)
    const other = buildForgeGeometry(BADGE, CANVAS, 91)

    expect(same).toEqual(first)
    expect(other.dots.map((dot) => dot.target)).toEqual(
      first.dots.map((dot) => dot.target),
    )
    expect(other.dots.map((dot) => dot.start)).not.toEqual(
      first.dots.map((dot) => dot.start),
    )
    expect(other.dots.map((dot) => dot.burst)).not.toEqual(
      first.dots.map((dot) => dot.burst),
    )
  })

  it('keeps starts and bursts inside the canvas', () => {
    const geometry = buildForgeGeometry(BADGE, { width: 320, height: 600 })

    for (const dot of geometry.dots) {
      expect(isFinitePoint(dot.start)).toBe(true)
      expect(isFinitePoint(dot.burst)).toBe(true)
      expect(dot.start.x).toBeGreaterThanOrEqual(0)
      expect(dot.start.x).toBeLessThanOrEqual(320)
      expect(dot.start.y).toBeGreaterThanOrEqual(0)
      expect(dot.start.y).toBeLessThanOrEqual(600)
      expect(dot.burst.x).toBeGreaterThanOrEqual(0)
      expect(dot.burst.x).toBeLessThanOrEqual(320)
      expect(dot.burst.y).toBeGreaterThanOrEqual(0)
      expect(dot.burst.y).toBeLessThanOrEqual(600)
    }
  })

  it('uses a readable grid pitch', () => {
    const geometry = buildForgeGeometry(BADGE, CANVAS)
    expect(FORGE_PITCH).toBeGreaterThanOrEqual(6)
    expect(FORGE_PITCH).toBeLessThanOrEqual(12)
    expect(geometry.dots[0].row).toBeGreaterThanOrEqual(0)
    expect(geometry.dots[0].col).toBeGreaterThanOrEqual(0)
  })

  it('returns an empty plan for a missing badge or canvas', () => {
    expect(buildForgeGeometry({ ...BADGE, width: 0 }, CANVAS).dots).toEqual([])
    expect(buildForgeGeometry({ ...BADGE, height: 0 }, CANVAS).dots).toEqual([])
    expect(buildForgeGeometry(BADGE, { width: 0, height: 900 }).dots).toEqual([])
  })

  it('caps the dot count for a very wide badge', () => {
    const geometry = buildForgeGeometry(
      { x: 10, y: 200, width: 2400, height: 40 },
      { width: 2600, height: 900 },
    )
    expect(geometry.dots.length).toBeLessThanOrEqual(MAX_FORGE_DOTS)
  })
})

describe('buildCollapseTargets', () => {
  const BUTTON: ForgeRect = { x: 380, y: 700, width: 96, height: 30 }

  it('returns one landing point per dot inside the button pill', () => {
    const targets = buildCollapseTargets(120, BUTTON)
    const inner: ForgeRect = {
      x: BUTTON.x + 5,
      y: BUTTON.y + 5,
      width: BUTTON.width - 10,
      height: BUTTON.height - 10,
    }

    expect(targets).toHaveLength(120)
    for (const target of targets) {
      expect(isFinitePoint(target)).toBe(true)
      expect(insidePill(target.x, target.y, inner, inner.height / 2)).toBe(true)
    }
  })

  it('handles a button with no room and a zero count', () => {
    expect(buildCollapseTargets(0, BUTTON)).toEqual([])
    const targets = buildCollapseTargets(4, {
      x: 10,
      y: 10,
      width: 0,
      height: 0,
    })
    expect(targets).toHaveLength(4)
    expect(targets.every(isFinitePoint)).toBe(true)
  })

  it('is deterministic per seed', () => {
    expect(buildCollapseTargets(12, BUTTON, 3)).toEqual(
      buildCollapseTargets(12, BUTTON, 3),
    )
  })
})
