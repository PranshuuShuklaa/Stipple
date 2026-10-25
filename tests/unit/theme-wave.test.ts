import { describe, expect, it } from 'vitest'
import {
  shouldWaveTheme,
  themeWaveRadius,
} from '@/lib/theme-wave'

describe('Theme switch wave (signature animation 12)', () => {
  it('reaches the farthest viewport corner from the toggle', () => {
    const radius = themeWaveRadius(900, 40, 1000, 500)
    expect(radius).toBeGreaterThanOrEqual(Math.hypot(900, 460))
    expect(themeWaveRadius(0, 0, 1000, 500)).toBe(
      Math.ceil(Math.hypot(1000, 500)) + 2,
    )
  })

  it('runs on High and Medium, and disables for Low, reduced motion or no API', () => {
    expect(shouldWaveTheme('high', false, true)).toBe(true)
    expect(shouldWaveTheme('medium', false, true)).toBe(true)
    expect(shouldWaveTheme(null, false, true)).toBe(true)
    expect(shouldWaveTheme('low', false, true)).toBe(false)
    expect(shouldWaveTheme('high', true, true)).toBe(false)
    expect(shouldWaveTheme('high', false, false)).toBe(false)
  })
})
