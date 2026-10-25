import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  publishQualityTier,
  readQualityTier,
  resetQualityTierSignal,
  subscribeQualityTier,
} from '@/engine/quality-signal'

describe('quality signal', () => {
  beforeEach(() => {
    resetQualityTierSignal()
  })

  it('starts unknown so a section can render before the engine mounts', () => {
    expect(readQualityTier()).toBeNull()
  })

  it('publishes the active tier and notifies listeners once per change', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeQualityTier(listener)

    publishQualityTier('high')
    expect(readQualityTier()).toBe('high')
    expect(listener).toHaveBeenCalledTimes(1)

    publishQualityTier('high')
    expect(listener).toHaveBeenCalledTimes(1)

    publishQualityTier('low')
    expect(readQualityTier()).toBe('low')
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    publishQualityTier('medium')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('resets to unknown for isolated tests', () => {
    publishQualityTier('medium')
    resetQualityTierSignal()
    expect(readQualityTier()).toBeNull()
  })
})
