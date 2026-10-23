import type { ThemeColors } from './layouts/files'

/**
 * Parses hex (#fff, #ffffff) or rgb(r, g, b) strings into [r, g, b] tuples (0..255).
 */
export function parseColor(color: string): [number, number, number] {
  const trimmed = color.trim()

  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1)
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16)
      const g = parseInt(hex[1] + hex[1], 16)
      const b = parseInt(hex[2] + hex[2], 16)
      return [isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b]
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return [isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b]
    }
  }

  const rgbMatch = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (rgbMatch) {
    return [
      Math.min(255, Math.max(0, parseInt(rgbMatch[1], 10))),
      Math.min(255, Math.max(0, parseInt(rgbMatch[2], 10))),
      Math.min(255, Math.max(0, parseInt(rgbMatch[3], 10))),
    ]
  }

  // Fallback default fg
  return [26, 21, 51]
}

/**
 * Resolves theme colors from DOM computed styles.
 */
export function resolveThemeColors(element?: HTMLElement | null): ThemeColors {
  if (typeof window === 'undefined') {
    return {
      fg: [26, 21, 51],
      panel: [223, 217, 242],
      c1: [91, 43, 224],
      c2: [224, 36, 110],
      c3: [199, 119, 0],
      c4: [11, 143, 99],
      c5: [10, 127, 194],
    }
  }

  const target = element ?? document.documentElement
  const computed = window.getComputedStyle(target)

  const getProp = (name: string, fallback: string): string => {
    const val = computed.getPropertyValue(name).trim()
    return val || fallback
  }

  return {
    fg: parseColor(getProp('--fg', '#1A1533')),
    panel: parseColor(getProp('--panel', '#DFD9F2')),
    c1: parseColor(getProp('--c1', '#5B2BE0')),
    c2: parseColor(getProp('--c2', '#E0246E')),
    c3: parseColor(getProp('--c3', '#C77700')),
    c4: parseColor(getProp('--c4', '#0B8F63')),
    c5: parseColor(getProp('--c5', '#0A7FC2')),
  }
}
