import { describe, it, expect } from 'vitest'
import { ClusterDragEffect, CLUSTER_SPRING } from '@/engine/effects/drag-clusters'

const WIDTH = 800
const HEIGHT = 600
const RADIUS = 50

function createEffect(count = 3): ClusterDragEffect {
  const effect = new ClusterDragEffect()
  const centers = new Float32Array(count * 2)
  const radii = new Float32Array(count).fill(RADIUS)
  for (let i = 0; i < count; i++) {
    centers[i * 2] = 200 + i * 200
    centers[i * 2 + 1] = 300
  }
  effect.setGeometry(centers, radii, WIDTH, HEIGHT)
  return effect
}

function settle(effect: ClusterDragEffect, frames = 600): void {
  for (let frame = 0; frame < frames; frame++) effect.update(16, false)
}

describe('ClusterDragEffect (Signature Animation 9)', () => {
  it('reports the geometry slots and starts with no offsets', () => {
    const effect = createEffect()
    expect(effect.getSlotCount()).toBe(3)
    expect(effect.hasOffsets()).toBe(false)
    expect(effect.getActiveSlot()).toBe(-1)
    expect(effect.getTotalX(0)).toBe(0)
    expect(effect.getTotalY(0)).toBe(0)
  })

  it('moves the grabbed cluster and reports the active slot', () => {
    const effect = createEffect()
    effect.beginDrag(0)
    effect.setDrag(0, 120, -40)

    expect(effect.getActiveSlot()).toBe(0)
    expect(effect.getTotalX(0)).toBe(120)
    expect(effect.getTotalY(0)).toBe(-40)
    expect(effect.hasOffsets()).toBe(true)
  })

  it('reflows the other clusters out of an anchored cluster', () => {
    const effect = createEffect()
    effect.beginDrag(0)
    effect.setDrag(0, 120, 0)
    effect.update(16, true)

    expect(effect.getTotalX(0)).toBe(120)
    expect(effect.getTotalY(0)).toBe(0)
    expect(effect.getTotalX(1)).toBeGreaterThan(0)
    expect(effect.getTotalX(1)).toBeCloseTo(
      RADIUS * 2 + CLUSTER_SPRING.separationPaddingPx - 80,
      5,
    )
  })

  it('springs the reflow offsets to rest instead of snapping', () => {
    const effect = createEffect()
    effect.beginDrag(0)
    effect.setDrag(0, 120, 0)
    effect.update(16, false)

    const firstFrame = effect.getTotalX(1)
    expect(firstFrame).toBeGreaterThan(0)
    expect(firstFrame).toBeLessThan(30)

    settle(effect)
    expect(effect.getTotalX(1)).toBeCloseTo(30, 1)
  })

  it('keeps the others clear of a cluster that settled in its new home', () => {
    const effect = createEffect()
    effect.beginDrag(0)
    effect.setDrag(0, 120, 0)
    effect.update(16, true)
    expect(effect.getTotalX(1)).toBeGreaterThan(0)

    effect.releaseDrag(0)
    effect.settleDrag(0)
    expect(effect.getActiveSlot()).toBe(-1)

    settle(effect)
    expect(effect.getTotalX(1)).toBeCloseTo(30, 1)
    expect(effect.getTotalX(0)).toBe(120)
    expect(effect.getTotalX(2)).toBe(0)
  })

  it('nudges a cluster by whole steps and clamps it inside the stage', () => {
    const effect = createEffect()
    effect.nudge(1, CLUSTER_SPRING.nudgePx, 0)
    expect(effect.getTotalX(1)).toBe(CLUSTER_SPRING.nudgePx)

    effect.nudge(1, 10000, 0)
    expect(effect.getTotalX(1)).toBe(WIDTH - RADIUS - 400)

    effect.nudge(1, -10000, 0)
    expect(effect.getTotalX(1)).toBe(RADIUS - 400)
  })

  it('sends every cluster home on reset', () => {
    const effect = createEffect()
    effect.beginDrag(0)
    effect.setDrag(0, 120, -40)
    effect.nudge(1, 24, 0)
    expect(effect.hasOffsets()).toBe(true)

    effect.reset()
    effect.update(16, true)

    expect(effect.getActiveSlot()).toBe(-1)
    expect(effect.hasOffsets()).toBe(false)
    expect(effect.getTotalX(0)).toBe(0)
    expect(effect.getTotalY(0)).toBe(0)
    expect(effect.getTotalX(1)).toBe(0)
  })

  it('springs reset home over time when motion is allowed', () => {
    const effect = createEffect()
    effect.beginDrag(0)
    effect.setDrag(0, 120, 0)
    effect.reset()

    effect.update(16, false)
    expect(effect.getTotalX(0)).toBeGreaterThan(0)
    settle(effect)
    expect(effect.getTotalX(0)).toBe(0)
  })

  it('clears all offsets when leaving the Folders view', () => {
    const effect = createEffect()
    effect.beginDrag(0)
    effect.setDrag(0, 120, 0)
    effect.update(16, true)
    effect.clear()

    expect(effect.hasOffsets()).toBe(false)
    expect(effect.getActiveSlot()).toBe(-1)
    expect(effect.getTotalX(0)).toBe(0)
    expect(effect.getTotalX(1)).toBe(0)
  })

  it('ignores out-of-range slots safely', () => {
    const effect = createEffect()
    effect.beginDrag(99)
    effect.setDrag(-1, 50, 50)
    effect.nudge(99, 24, 24)

    expect(effect.getActiveSlot()).toBe(-1)
    expect(effect.getTotalX(99)).toBe(0)
    expect(effect.getTotalY(-1)).toBe(0)
  })
})
