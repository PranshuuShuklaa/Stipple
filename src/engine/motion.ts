/**
 * Motion tokens for the dot engine (DESIGN.md and REFERENCE.md).
 * Uses anime.js v4 naming conventions.
 */

export const MOTION = {
  duration: {
    fast: 180,
    base: 450,
    slow: 900,
    morph: 1200,
    crossFade: 300,
  },
  easing: {
    out: 'outExpo',
    inOut: 'inOutExpo',
    quadOut: 'outQuad',
  },
  stagger: {
    morphGridMs: 6,
    gridCols: 24,
    gridRows: 10,
    storyBudgetMs: 200,
  },
  story: {
    labelStartMs: 800,
    labelFadeMs: 600,
  },
} as const

/**
 * Virtual duration of one story morph segment. The final 200 ms hold the
 * last dots to start and let the folders labels finish their 800 + 600 ms
 * fade before the next step centre is reached.
 */
export const STORY_SEGMENT_MS = MOTION.duration.morph + MOTION.stagger.storyBudgetMs
