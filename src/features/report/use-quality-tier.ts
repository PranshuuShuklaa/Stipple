'use client'

import { useSyncExternalStore } from 'react'
import type { QualityTierName } from '@/engine/quality'
import { readQualityTier, subscribeQualityTier } from '@/engine/quality-signal'

/** Reads the dot engine's active tier; null until an engine mounts. */
export function useQualityTier(): QualityTierName | null {
  return useSyncExternalStore(
    subscribeQualityTier,
    readQualityTier,
    () => null,
  )
}
