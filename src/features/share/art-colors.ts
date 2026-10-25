/**
 * Colors for server-generated artifacts (SVG badges, OG PNGs).
 *
 * Mirrors the token values declared in src/styles/tokens.css, because SVG
 * files and Satori-rendered images cannot resolve CSS variables from the
 * site stylesheet. When a token changes in tokens.css, change it here too —
 * the unit tests pin the AA contrast, so a drift that breaks accessibility
 * fails the tests.
 */

/** Dark-theme tokens (the OG image is always the dark page background). */
export const ART_COLORS = {
  bg: '#100C24',
  panel: '#1A1438',
  fg: '#F1EEFF',
  dim: '#A89FCF',
  line: '#2E2658',
  c1: '#9A7BFF',
  c2: '#FF5C9A',
  c3: '#FFB33D',
  c4: '#3DDC97',
  c5: '#4CC9FF',
} as const

/** WCAG 2.x relative luminance of a #rrggbb color. */
export function relativeLuminance(hex: string): number {
  const value = hex.length === 7 && hex[0] === '#' ? hex.slice(1) : hex
  const channels = [0, 1, 2].map((i) => {
    const channel = parseInt(value.slice(i * 2, i * 2 + 2), 16)
    const s = Number.isNaN(channel) ? 0 : channel / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

/** WCAG contrast ratio (1..21), min 4.5:1 = AA normal text. */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA)
  const lb = relativeLuminance(hexB)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/** The first background/text pair that passes AA normal text (4.5:1). */
export function readablePair(candidates: { bg: string; fg: string }[]): { bg: string; fg: string } {
  for (const candidate of candidates) {
    if (contrastRatio(candidate.bg, candidate.fg) >= 4.5) return candidate
  }
  return candidates[candidates.length - 1]
}
