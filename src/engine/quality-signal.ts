import type { QualityTierName } from './quality'

/**
 * The active dot engine is the quality authority for the page (DESIGN.md
 * "Quality tiers"). Other client sections that orbit the dot field, such as
 * the share section, listen here instead of measuring their own fps.
 * Deliberately plain: no React in the engine.
 */

type QualityTierListener = () => void

let currentTier: QualityTierName | null = null
const listeners = new Set<QualityTierListener>()

/** Publishes a tier change; listeners read the value through readQualityTier. */
export function publishQualityTier(tier: QualityTierName): void {
  if (currentTier === tier) return
  currentTier = tier
  for (const listener of listeners) listener()
}

export function readQualityTier(): QualityTierName | null {
  return currentTier
}

export function subscribeQualityTier(listener: QualityTierListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Clears the signal between isolated unit tests. */
export function resetQualityTierSignal(): void {
  currentTier = null
  for (const listener of listeners) listener()
}
