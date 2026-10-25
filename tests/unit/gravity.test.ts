import { describe, expect, it } from 'vitest'
import { GravityBounceEffect, GRAVITY_BOUNCE } from '@/engine/effects/gravity'

describe('Konami gravity bounce (signature animation 13)', () => {
  it('falls, bounces off the stage bottom and returns every dot to rest', () => {
    const effect = new GravityBounceEffect()
    const n = 3
    effect.allocate(n)
    effect.trigger()

    const x = new Float32Array([10, 20, 30])
    const y = new Float32Array([0, 40, 200])
    const size = new Float32Array(n).fill(8)
    const height = 240

    let maxOffset = 0
    let bounced = false
    let previous = 0

    for (let elapsed = 0; elapsed < 1400; elapsed += 16) {
      effect.update(16, x, y, size, n, height)
      const offset = effect.getOffset(0)
      if (offset > maxOffset) maxOffset = offset
      if (previous > 180 && offset < previous - 5) bounced = true
      previous = offset

      for (let i = 0; i < n; i++) {
        const center = y[i] + size[i] / 2 + effect.getOffset(i)
        expect(center).toBeLessThanOrEqual(
          height - GRAVITY_BOUNCE.bottomInsetPx + 0.01,
        )
      }
    }

    expect(effect.isActive()).toBe(true)
    expect(maxOffset).toBeGreaterThan(100)
    expect(bounced).toBe(true)

    effect.update(
      GRAVITY_BOUNCE.returnMs + 100,
      x,
      y,
      size,
      n,
      height,
    )
    expect(effect.isActive()).toBe(false)
    for (let i = 0; i < n; i++) expect(effect.getOffset(i)).toBe(0)
  })

  it('can be reset when quality drops or the stage unmounts', () => {
    const effect = new GravityBounceEffect()
    effect.allocate(5)
    effect.trigger()
    expect(effect.isActive()).toBe(true)
    effect.reset()
    expect(effect.isActive()).toBe(false)
    expect(effect.getOffset(0)).toBe(0)
  })
})
