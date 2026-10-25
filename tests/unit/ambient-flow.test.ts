import { describe, expect, it } from 'vitest'
import {
  AMBIENT_MAX_AMPLITUDE_PX,
  sampleAmbientOffset,
} from '@/engine/effects/ambient-flow'

describe('Ambient flow (signature animation 11)', () => {
  it('keeps every dot under the 3 px breathing amplitude', () => {
    const out = new Float32Array(2)
    let max = 0

    for (let index = 0; index < 1000; index++) {
      for (let timeMs = 0; timeMs <= 200000; timeMs += 5000) {
        sampleAmbientOffset(out, index, index * 3.7, index * 1.3, timeMs)
        const magnitude = Math.hypot(out[0], out[1])
        if (magnitude > max) max = magnitude
        expect(Number.isFinite(out[0])).toBe(true)
        expect(Number.isFinite(out[1])).toBe(true)
      }
    }

    expect(max).toBeLessThan(3)
    expect(max).toBeLessThanOrEqual(AMBIENT_MAX_AMPLITUDE_PX)
  })

  it('is deterministic for the same dot, position and time', () => {
    const a = new Float32Array(2)
    const b = new Float32Array(2)
    sampleAmbientOffset(a, 42, 120, 80, 9000)
    sampleAmbientOffset(b, 42, 120, 80, 9000)
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('moves very slowly: a 200 ms step changes the offset by less than 0.2 px', () => {
    const a = new Float32Array(2)
    const b = new Float32Array(2)
    sampleAmbientOffset(a, 7, 300, 200, 10000)
    sampleAmbientOffset(b, 7, 300, 200, 10200)
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThan(0.2)
  })
})
