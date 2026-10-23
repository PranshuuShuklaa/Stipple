import { describe, expect, it } from 'vitest'
import { pickActiveStepIndex } from '@/features/report/step-activation'

describe('pickActiveStepIndex', () => {
  it('picks the step whose center is nearest the viewport center', () => {
    const samples = [
      { index: 0, top: 0, bottom: 300 },
      { index: 1, top: 300, bottom: 700 },
      { index: 2, top: 700, bottom: 1200 },
    ]
    expect(pickActiveStepIndex(samples, 400)).toBe(1)
  })

  it('is direction-agnostic: the same edges picked in reverse order decide identically', () => {
    const down = [
      { index: 0, top: 50, bottom: 250 },
      { index: 1, top: 250, bottom: 650 },
      { index: 2, top: 650, bottom: 1150 },
    ]
    const up = [down[2], down[1], down[0]]
    expect(pickActiveStepIndex(down, 500)).toBe(1)
    expect(pickActiveStepIndex(up, 500)).toBe(1)
  })

  it('breaks exact ties by taking the first (minimum index) step', () => {
    const samples = [
      { index: 0, top: 0, bottom: 200 },
      { index: 1, top: 600, bottom: 800 },
      { index: 2, top: 600, bottom: 800 },
    ]
    // Box 0 center (100) and box 1/2 centers (700) are equally far from 400;
    // the earliest index wins.
    expect(pickActiveStepIndex(samples, 400)).toBe(0)
  })

  it('stays put on an empty sample list', () => {
    expect(pickActiveStepIndex([], 300)).toBe(0)
  })

  it('handles a single tiny-data step', () => {
    expect(pickActiveStepIndex([{ index: 0, top: 100, bottom: 140 }], 400)).toBe(0)
  })
})
