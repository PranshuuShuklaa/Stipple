/**
 * Quality tiers (DESIGN.md "Quality tiers").
 * High: 55+ fps, all dots (up to 3,000), everything on.
 * Medium: 45-55 fps, up to 1,500 dots, no pointer field or ambient flow.
 * Low: under 45 fps or reduced motion, up to 600 dots, morphs only.
 * Measurement runs over the first 60 frames, re-checks on resize, and
 * never switches tiers more than once every 5 seconds.
 */

export type QualityTierName = 'high' | 'medium' | 'low'

export interface QualityEffects {
  pointerField: boolean
  ambientFlow: boolean
  perFrameEffects: boolean
}

export interface QualityTier {
  name: QualityTierName
  label: string
  maxDots: number
  effects: QualityEffects
}

export const QUALITY_TIERS: Record<QualityTierName, QualityTier> = {
  high: {
    name: 'high',
    label: 'High',
    maxDots: 3000,
    effects: { pointerField: true, ambientFlow: true, perFrameEffects: true },
  },
  medium: {
    name: 'medium',
    label: 'Medium',
    maxDots: 1500,
    effects: { pointerField: false, ambientFlow: false, perFrameEffects: true },
  },
  low: {
    name: 'low',
    label: 'Low',
    maxDots: 600,
    effects: { pointerField: false, ambientFlow: false, perFrameEffects: false },
  },
}

export const QUALITY_CONFIG = {
  highFps: 55,
  lowFps: 45,
  measurementFrames: 60,
  cooldownMs: 5000,
} as const

export function pickTier(fps: number, reducedMotion = false): QualityTierName {
  if (reducedMotion) return 'low'
  if (fps >= QUALITY_CONFIG.highFps) return 'high'
  if (fps >= QUALITY_CONFIG.lowFps) return 'medium'
  return 'low'
}

/**
 * Measures average frame pacing over a fixed window of frames.
 * Feed one rAF timestamp per frame; measurement completes on the last frame.
 */
export class FpsMeter {
  private sampleCount = 0
  private first = 0
  private last = 0
  private measured: number | null = null

  constructor(readonly frameCount: number = QUALITY_CONFIG.measurementFrames) {}

  public reset(): void {
    this.sampleCount = 0
    this.first = 0
    this.last = 0
    this.measured = null
  }

  public record(timestampMs: number): number | null {
    if (this.sampleCount >= this.frameCount) return null
    if (this.sampleCount === 0) this.first = timestampMs
    this.sampleCount++
    this.last = timestampMs
    if (this.sampleCount < this.frameCount) return null

    const intervals = this.frameCount - 1
    const avgMs = (this.last - this.first) / intervals
    this.measured = avgMs > 0 ? 1000 / avgMs : null
    return this.measured
  }

  public getFps(): number | null {
    return this.measured
  }

  public get isComplete(): boolean {
    return this.sampleCount >= this.frameCount
  }
}

export interface TierEvaluation {
  tier: QualityTierName
  previous: QualityTierName
  changed: boolean
}

/**
 * Holds the current tier and the switch cooldown. Pure logic, no DOM.
 * A tier switch is allowed when the cooldown has elapsed or when
 * reduced motion forces the Low tier.
 */
export class TierController {
  private tier: QualityTierName
  private reducedMotion: boolean
  private lastFps: number | null = null
  private lastSwitchAt = Number.NEGATIVE_INFINITY

  constructor(reducedMotion = false, initial: QualityTierName = 'high') {
    this.reducedMotion = reducedMotion
    this.tier = reducedMotion ? 'low' : initial
  }

  public getTier(): QualityTierName {
    return this.tier
  }

  public setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced
  }

  public evaluate(
    fps: number | null,
    nowMs: number,
    options?: { forceLow?: boolean }
  ): TierEvaluation {
    if (fps !== null) this.lastFps = fps

    const desired = this.reducedMotion
      ? 'low'
      : pickTier(this.lastFps ?? Number.POSITIVE_INFINITY)

    const previous = this.tier
    if (desired === previous) {
      return { tier: previous, previous, changed: false }
    }

    const forceLow = options?.forceLow === true && desired === 'low'
    const cooldownElapsed = nowMs - this.lastSwitchAt >= QUALITY_CONFIG.cooldownMs
    if (!forceLow && !cooldownElapsed) {
      return { tier: previous, previous, changed: false }
    }

    this.tier = desired
    this.lastSwitchAt = nowMs
    return { tier: desired, previous, changed: true }
  }

  public msUntilNextSwitch(nowMs: number): number {
    return Math.max(0, QUALITY_CONFIG.cooldownMs - (nowMs - this.lastSwitchAt))
  }
}
