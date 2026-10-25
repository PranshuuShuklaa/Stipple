import { eases, stagger } from 'animejs'
import { MOTION, STORY_SEGMENT_MS } from './motion'

/**
 * Pure helpers behind the scroll-scrubbed story. The component only feeds
 * segment progress values into these functions, so a frame is a function of
 * its position alone: scrolling backward reaches the same frame as scrolling
 * forward, and stopping mid-scroll leaves the last frame on screen.
 */

export interface StoryFrameState {
  segment: number
  progress: number
  layoutIndex: number
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function resolveStoryFrame(frames: readonly number[]): StoryFrameState {
  const segmentCount = Math.max(1, frames.length)
  let segment = 0
  while (segment < segmentCount - 1 && (frames[segment] ?? 0) >= 1) {
    segment++
  }
  const progress = clamp01(frames[segment] ?? 0)
  return {
    segment,
    progress,
    layoutIndex: Math.min(segmentCount, Math.round(segment + progress)),
  }
}

/** Per-dot progress for one segment: 1200 ms easeInOutExpo after its delay. */
export function storyDotProgress(segmentProgress: number, delayMs: number): number {
  const elapsed = clamp01(segmentProgress) * STORY_SEGMENT_MS - delayMs
  return eases.inOutExpo(clamp01(elapsed / MOTION.duration.morph))
}

export function storyLabelOpacity(segmentProgress: number): number {
  const elapsed = clamp01(segmentProgress) * STORY_SEGMENT_MS - MOTION.story.labelStartMs
  return clamp01(elapsed / MOTION.story.labelFadeMs)
}

/**
 * anime.js v4 grid stagger delays for the incoming layout, compressed into
 * the story budget so every dot finishes inside one segment even when a
 * layout's grid is taller or wider than the reference 24 by 10 grid.
 */
export function computeStoryDelays(dotCount: number, cols: number, rows: number): Float32Array {
  const delays = new Float32Array(Math.max(0, dotCount))
  if (dotCount <= 0) return delays

  const targets = Array.from({ length: dotCount }, () => ({}))
  const delayFor = stagger(MOTION.stagger.morphGridMs, {
    grid: [Math.max(1, cols), Math.max(1, rows)],
    from: 'center',
  })

  let max = 0
  for (let i = 0; i < dotCount; i++) {
    const delay = Number(delayFor(targets[i], i, targets))
    delays[i] = delay
    if (delay > max) max = delay
  }

  const budget = MOTION.stagger.storyBudgetMs
  if (max > budget) {
    const scale = budget / max
    for (let i = 0; i < dotCount; i++) {
      // Clamp after scaling so float32 storage can never land above the budget.
      delays[i] = Math.min(budget, delays[i] * scale)
    }
  }

  return delays
}
