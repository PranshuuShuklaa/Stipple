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
  },
} as const
