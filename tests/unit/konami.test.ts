import { describe, expect, it } from 'vitest'
import {
  KONAMI_RESET_MS,
  KONAMI_SEQUENCE,
  advanceKonami,
  isTypingTarget,
  normalizeKonamiKey,
} from '@/engine/effects/konami'

describe('Konami code matcher (signature animation 13)', () => {
  it('completes only after the full standard sequence', () => {
    let progress = 0
    for (const key of KONAMI_SEQUENCE) {
      progress = advanceKonami(progress, key, 100)
      expect(progress).toBeGreaterThan(0)
    }
    expect(progress).toBe(KONAMI_SEQUENCE.length)
  })

  it('resets on a wrong key and restarts when that key is the first step', () => {
    expect(advanceKonami(3, 'a', 100)).toBe(0)
    expect(advanceKonami(3, 'ArrowUp', 100)).toBe(1)
  })

  it('accepts uppercase letter keys', () => {
    let progress = 0
    for (const key of KONAMI_SEQUENCE) {
      const typed = key.length === 1 ? key.toUpperCase() : key
      progress = advanceKonami(progress, typed, 100)
    }
    expect(progress).toBe(KONAMI_SEQUENCE.length)
    expect(normalizeKonamiKey('B')).toBe('b')
  })

  it('restarts after a long pause', () => {
    let progress = advanceKonami(0, 'ArrowUp', 0)
    progress = advanceKonami(progress, 'ArrowUp', 100)
    progress = advanceKonami(progress, 'ArrowUp', KONAMI_RESET_MS + 1)
    expect(progress).toBe(1)
  })

  it('ignores form fields so typing cannot complete it by accident', () => {
    expect(isTypingTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true)
    expect(isTypingTarget({ tagName: 'textarea' } as unknown as EventTarget)).toBe(true)
    expect(isTypingTarget({ isContentEditable: true } as unknown as EventTarget)).toBe(true)
    expect(isTypingTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
