/**
 * The report story's active-step rule (REFERENCE.md "Stage and story
 * layout"): a step is active when it crosses the middle of the screen.
 * The IntersectionObserver only wakes this rule up on band crossings;
 * the pure function decides WHICH step wins by nearest box center, so
 * the answer is identical scrolling down and scrolling back up.
 */

export interface StepSide {
  top: number
  bottom: number
}

export interface StepSample {
  index: number
  top: number
  bottom: number
}

/** The step whose vertical center is closest to the viewport center. */
export function pickActiveStepIndex(samples: StepSample[], viewportCenter: number): number {
  let best = 0
  let bestDistance = Infinity
  for (const sample of samples) {
    const center = (sample.top + sample.bottom) / 2
    const distance = Math.abs(center - viewportCenter)
    if (distance < bestDistance) {
      bestDistance = distance
      best = sample.index
    }
  }
  return best
}
