import { createTimeline, stagger, type Target, type Timeline } from 'animejs'

import type { AnimatedForgeDot } from './link-forge-paint'

const REST_ALPHA = 0.9
const INTRO_MS = 900
const INTRO_SCALE = 0.4
const REFORM_MS = 140
const BURST_MS = 300
const BURST_STAGGER_MS = 1.5
const BURST_HOLD_MS = 80
const COLLAPSE_MS = 440
const COLLAPSE_STAGGER_MS = 4
const COLLAPSE_FADE_MS = 160

export const FORGE_REST_ALPHA = REST_ALPHA

/** Puts every dot at its start ring, ready for the intro. */
export function resetDotsForForm(dots: readonly AnimatedForgeDot[]): void {
  for (const dot of dots) {
    dot.x = dot.start.x
    dot.y = dot.start.y
    dot.alpha = 1
    dot.scale = INTRO_SCALE
  }
}

/** Puts every dot exactly on its target, fully opaque, at final size. */
export function resetDotsToRest(dots: readonly AnimatedForgeDot[]): void {
  for (const dot of dots) {
    dot.x = dot.target.x
    dot.y = dot.target.y
    dot.alpha = REST_ALPHA
    dot.scale = 1
  }
}

/** Dots fly in from their deterministic start ring and settle on the badge frame. */
export function buildFormTimeline(
  dots: AnimatedForgeDot[],
  onUpdate: () => void,
  onComplete: () => void,
): Timeline {
  return createTimeline({ onUpdate, onComplete }).add(dots, {
    x: (target?: Target) => (target as AnimatedForgeDot).target.x,
    y: (target?: Target) => (target as AnimatedForgeDot).target.y,
    alpha: REST_ALPHA,
    scale: 1,
    duration: INTRO_MS,
    ease: 'outExpo',
    delay: (target?: Target) => (target as AnimatedForgeDot).introDelay,
  })
}

/**
 * Reform, burst outward from the badge center, then stream into the pill and
 * fade. The fade starts COLLAPSE_MS - COLLAPSE_FADE_MS into each dot's own
 * collapse, so every dot disappears exactly as it lands.
 */
export function buildBurstTimeline(
  dots: AnimatedForgeDot[],
  fromRest: boolean,
  onUpdate: () => void,
  onComplete: () => void,
): Timeline {
  const timeline = createTimeline({ onUpdate, onComplete })

  timeline.add(dots, {
    x: (target?: Target) => (target as AnimatedForgeDot).target.x,
    y: (target?: Target) => (target as AnimatedForgeDot).target.y,
    alpha: REST_ALPHA,
    scale: 1,
    duration: REFORM_MS,
    ease: 'outExpo',
  })

  timeline.add(
    dots,
    {
      x: (target?: Target) => (target as AnimatedForgeDot).burst.x,
      y: (target?: Target) => (target as AnimatedForgeDot).burst.y,
      duration: BURST_MS,
      ease: 'outQuad',
      delay: stagger(BURST_STAGGER_MS, { from: 'center' }),
    },
    fromRest ? 0 : '+=10',
  )

  timeline.label('collapse', `+=${BURST_HOLD_MS}`)
  timeline.add(
    dots,
    {
      x: (target?: Target) => (target as AnimatedForgeDot).collapse.x,
      y: (target?: Target) => (target as AnimatedForgeDot).collapse.y,
      duration: COLLAPSE_MS,
      ease: 'inOutExpo',
      delay: stagger(COLLAPSE_STAGGER_MS, { from: 'center' }),
    },
    'collapse',
  )
  timeline.add(
    dots,
    {
      alpha: 0,
      duration: COLLAPSE_FADE_MS,
      ease: 'linear',
      delay: stagger(COLLAPSE_STAGGER_MS, {
        from: 'center',
        start: COLLAPSE_MS - COLLAPSE_FADE_MS,
      }),
    },
    'collapse',
  )

  return timeline
}
