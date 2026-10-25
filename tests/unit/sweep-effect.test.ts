import { describe, expect, it } from 'vitest'
import { SWEEP_SHIMMER_PERIOD_MS, SweepEffect } from '@/engine/effects/sweep'

describe('SweepEffect while the scan waits', () => {
  it('shimmers the gray field during streaming and during the fallback', () => {
    for (const mode of ['waiting', 'shimmer'] as const) {
      const sweep = new SweepEffect()
      sweep.setMode(mode)
      sweep.setLine(0.2)

      expect(sweep.holdsColors()).toBe(true)
      expect(sweep.isShimmering()).toBe(true)
      expect(sweep.isLineVisible()).toBe(true)

      const factors = [0, 0.25, 0.5, 0.75].map((xFrac) => sweep.shimmerFactor(xFrac, 0))
      expect(new Set(factors).size).toBeGreaterThan(1)
      expect(Math.min(...factors)).toBeGreaterThanOrEqual(0.65 - 1e-9)
      expect(Math.max(...factors)).toBeLessThanOrEqual(1)
    }
  })

  it('moves the shimmer wave over time without flashing', () => {
    const sweep = new SweepEffect()
    sweep.setMode('waiting')
    const values = [0, 0.25, 0.5, 0.75].map((phase) =>
      sweep.shimmerFactor(0.5, phase * SWEEP_SHIMMER_PERIOD_MS),
    )
    expect(new Set(values).size).toBeGreaterThan(1)
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0.64)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('stops line, shimmer and color reveal when an error turns the sweep off', () => {
    const sweep = new SweepEffect()
    sweep.setMode('waiting')
    sweep.setLine(0.6)
    expect(sweep.isShimmering()).toBe(true)

    sweep.setMode('off')
    expect(sweep.holdsColors()).toBe(false)
    expect(sweep.isShimmering()).toBe(false)
    expect(sweep.isLineVisible()).toBe(false)
    expect(sweep.isRevealed(10, 400)).toBe(false)
    expect(sweep.shimmerFactor(0.5, 100)).toBe(1)
  })
})

describe('SweepEffect reveal', () => {
  it('colors only the dots the line has passed and never shimmers during the reveal', () => {
    const sweep = new SweepEffect()
    sweep.setMode('reveal')
    sweep.setLine(0.5)

    expect(sweep.isRevealed(100, 400)).toBe(true)
    expect(sweep.isRevealed(200, 400)).toBe(true)
    expect(sweep.isRevealed(300, 400)).toBe(false)
    expect(sweep.isShimmering()).toBe(false)
    expect(sweep.shimmerFactor(0.5, 100)).toBe(1)
  })

  it('turns every sweep effect off for reduced motion', () => {
    const sweep = new SweepEffect()
    sweep.setMode('waiting')
    sweep.setLine(0.4)
    sweep.setReducedMotion(true)

    expect(sweep.holdsColors()).toBe(false)
    expect(sweep.isShimmering()).toBe(false)
    expect(sweep.isLineVisible()).toBe(false)
    expect(sweep.isRevealed(10, 400)).toBe(false)
  })
})
