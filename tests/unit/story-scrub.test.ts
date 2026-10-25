import { describe, expect, it } from 'vitest'
import { MOTION, STORY_SEGMENT_MS } from '@/engine/motion'
import {
  computeStoryDelays,
  resolveStoryFrame,
  storyDotProgress,
  storyLabelOpacity,
} from '@/engine/story'

describe('scroll story frame mapping', () => {
  it('maps the four step centres to the four layouts', () => {
    expect(resolveStoryFrame([0, 0, 0])).toEqual({ segment: 0, progress: 0, layoutIndex: 0 })
    expect(resolveStoryFrame([1, 0, 0])).toEqual({ segment: 1, progress: 0, layoutIndex: 1 })
    expect(resolveStoryFrame([1, 1, 0])).toEqual({ segment: 2, progress: 0, layoutIndex: 2 })
    expect(resolveStoryFrame([1, 1, 1])).toEqual({ segment: 2, progress: 1, layoutIndex: 3 })
  })

  it('holds intermediate progress instead of snapping to a step', () => {
    const frame = resolveStoryFrame([0.42, 0, 0])
    expect(frame.segment).toBe(0)
    expect(frame.progress).toBeCloseTo(0.42)
    expect(frame.layoutIndex).toBe(0)
  })

  it('switches the active layout at the segment midpoint', () => {
    expect(resolveStoryFrame([0.49, 0, 0]).layoutIndex).toBe(0)
    expect(resolveStoryFrame([0.5, 0, 0]).layoutIndex).toBe(1)
    expect(resolveStoryFrame([1, 0.5, 0]).layoutIndex).toBe(2)
  })

  it('is stateless, so a frame maps identically forward and backward', () => {
    const forward = resolveStoryFrame([1, 0.37, 0])
    const backward = resolveStoryFrame([1, 0.37, 0])
    expect(backward).toEqual(forward)
  })

  it('clamps out-of-range progress and pads missing frames', () => {
    expect(resolveStoryFrame([])).toEqual({ segment: 0, progress: 0, layoutIndex: 0 })
    expect(resolveStoryFrame([2, -1, 0.5])).toMatchObject({ segment: 1, progress: 0 })
  })
})

describe('story dot progress', () => {
  it('runs each dot from 0 to 1 inside one segment', () => {
    expect(storyDotProgress(0, 0)).toBe(0)
    expect(storyDotProgress(1, 0)).toBe(1)
    expect(storyDotProgress(1, MOTION.stagger.storyBudgetMs)).toBe(1)
  })

  it('starts a delayed dot only after its stagger delay', () => {
    const budget = MOTION.stagger.storyBudgetMs
    expect(storyDotProgress(0.05, budget)).toBe(0)
    expect(storyDotProgress(0.5, budget)).toBeGreaterThan(0)
    expect(storyDotProgress(0.5, budget)).toBeLessThan(1)
  })

  it('is monotonic from 0 to 1 for every delay', () => {
    for (const delay of [0, 40, 120, MOTION.stagger.storyBudgetMs]) {
      let previous = -1
      for (let step = 0; step <= 20; step++) {
        const value = storyDotProgress(step / 20, delay)
        expect(value).toBeGreaterThanOrEqual(previous)
        previous = value
      }
      expect(previous).toBe(1)
    }
  })

  it('is clamped for out-of-range segment progress', () => {
    expect(storyDotProgress(-1, 0)).toBe(0)
    expect(storyDotProgress(2, 0)).toBe(1)
  })
})

describe('story label fade', () => {
  it('stays hidden until the reference 800 ms start', () => {
    expect(storyLabelOpacity(0)).toBe(0)
    expect(storyLabelOpacity(MOTION.story.labelStartMs / STORY_SEGMENT_MS)).toBe(0)
  })

  it('finishes exactly at the end of the segment', () => {
    expect(storyLabelOpacity(1)).toBe(1)
    const half = (MOTION.story.labelStartMs + MOTION.story.labelFadeMs / 2) / STORY_SEGMENT_MS
    expect(storyLabelOpacity(half)).toBeCloseTo(0.5)
  })
})

describe('story stagger delays', () => {
  it('keeps the reference 6 ms grid stagger for a 24 by 10 grid', () => {
    const delays = computeStoryDelays(240, 24, 10)
    expect(delays).toHaveLength(240)

    const corner = delays[0]
    const center = delays[4 * 24 + 12]
    const expectedCorner = MOTION.stagger.morphGridMs * Math.hypot(11.5, 4.5)

    expect(corner).toBeCloseTo(expectedCorner, 1)
    expect(corner).toBeLessThanOrEqual(MOTION.stagger.storyBudgetMs)
    expect(center).toBeLessThan(corner)
  })

  it('compresses pathological grids into the story budget', () => {
    const delays = computeStoryDelays(2500, 209, 12)
    let max = 0
    for (const delay of delays) {
      expect(Number.isFinite(delay)).toBe(true)
      expect(delay).toBeGreaterThanOrEqual(0)
      if (delay > max) max = delay
    }
    expect(max).toBeCloseTo(MOTION.stagger.storyBudgetMs, 5)
  })

  it('returns an empty list without dots', () => {
    expect(computeStoryDelays(0, 24, 10)).toHaveLength(0)
  })
})
