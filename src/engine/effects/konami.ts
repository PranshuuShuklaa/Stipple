/**
 * Konami code input (DESIGN.md signature 13). Hidden reward: no UI hint.
 * Pure sequence logic lives here so the engine only owns the listener and
 * the gravity effect.
 */

export const KONAMI_SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
] as const

/** A long pause starts the sequence over instead of matching days later. */
export const KONAMI_RESET_MS = 3000

export function normalizeKonamiKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key
}

/**
 * Advances the matcher by one key. A mismatch restarts from the beginning,
 * except when the mismatched key is itself the first key of the sequence.
 */
export function advanceKonami(
  progress: number,
  key: string,
  sinceLastKeyMs = 0,
): number {
  let index = progress
  if (index < 0 || index >= KONAMI_SEQUENCE.length) index = 0
  if (index > 0 && sinceLastKeyMs > KONAMI_RESET_MS) index = 0

  const normalized = normalizeKonamiKey(key)
  if (normalized === KONAMI_SEQUENCE[index]) return index + 1
  if (normalized === KONAMI_SEQUENCE[0]) return 1
  return 0
}

/** Keeps form typing from completing the code by accident. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const element = target as { tagName?: unknown; isContentEditable?: unknown }
  const tag = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : ''
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    element.isContentEditable === true
  )
}
