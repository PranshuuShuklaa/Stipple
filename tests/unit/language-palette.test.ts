import { describe, expect, it } from 'vitest'
import { interpolatePalette } from '@/lib/language-palette'

describe('interpolatePalette', () => {
  it('returns the source and target palettes at the endpoints', () => {
    const source = ['#000000', '#101010']
    const target = ['#ffffff', '#202020']

    expect(interpolatePalette(source, target, 0)).toEqual(source)
    expect(interpolatePalette(source, target, 1)).toEqual(target)
  })

  it('clamps progress and interpolates each channel', () => {
    expect(interpolatePalette(['#000000'], ['#ffffff'], 0.5)).toEqual(['#808080'])
    expect(interpolatePalette(['#000000'], ['#ffffff'], 2)).toEqual(['#ffffff'])
  })
})
