import type { Scan } from './types/scan'

const LANGUAGE_COLORS: Record<string, string> = {
  typescript: '#4C8DFF',
  javascript: '#FFD23F',
  python: '#3DDC97',
  css: '#2ED8E8',
  html: '#FF6B4A',
  rust: '#FF9F5A',
  java: '#FF5C9A',
  'c++': '#B38CFF',
  c: '#B38CFF',
  go: '#4CC9FF',
  ruby: '#F05D6B',
  php: '#A88BFF',
  swift: '#FF8A4C',
  kotlin: '#A97BFF',
  shell: '#8DDC6F',
  'jupyter notebook': '#F2C94C',
}

const FALLBACK_COLORS = ['#9A7BFF', '#FF5C9A', '#FFB33D', '#3DDC97', '#4CC9FF']
const DARK_BACKGROUND = '#100C24'
const LIGHT_BACKGROUND = '#1A1533'

function parseHex(value: string): [number, number, number] {
  const raw = value.slice(1)
  return [
    Number.parseInt(raw.slice(0, 2), 16),
    Number.parseInt(raw.slice(2, 4), 16),
    Number.parseInt(raw.slice(4, 6), 16),
  ]
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

function mixWithBackground(color: string, background: string, amount: number): string {
  const source = parseHex(color)
  const target = parseHex(background)
  return toHex(source.map((value, index) => Math.round(value + (target[index] - value) * amount)) as [number, number, number])
}

function parsePaletteColor(value: string): [number, number, number] {
  const raw = value.replace('#', '')
  return [
    Number.parseInt(raw.slice(0, 2), 16),
    Number.parseInt(raw.slice(2, 4), 16),
    Number.parseInt(raw.slice(4, 6), 16),
  ]
}

function paletteColorToHex([r, g, b]: [number, number, number]): string {
  return toHex([r, g, b])
}

export function fixedLanguageColor(language: string | null | undefined, dark = true): string {
  const base = LANGUAGE_COLORS[(language ?? 'Other').trim().toLowerCase()] ?? '#A89FCF'
  return dark ? base : mixWithBackground(base, LIGHT_BACKGROUND, 0.32)
}

export function paletteForScan(scan: Scan, dark = true): string[] {
  const top = scan.languages.slice(0, 5)
  return Array.from({ length: 5 }, (_, index) =>
    top[index] ? fixedLanguageColor(top[index].name, dark) : FALLBACK_COLORS[index],
  )
}

export function paletteString(colors: readonly string[]): string {
  return colors.join('|')
}

export function interpolatePalette(from: readonly string[], to: readonly string[], progress: number): string[] {
  const amount = Math.min(1, Math.max(0, progress))
  return to.map((target, index) => {
    const source = from[index] ?? target
    const sourceRgb = parsePaletteColor(source)
    const targetRgb = parsePaletteColor(target)
    return paletteColorToHex(sourceRgb.map((value, channel) =>
      Math.round(value + (targetRgb[channel] - value) * amount),
    ) as [number, number, number])
  })
}

export const DEFAULT_LANGUAGE_PALETTE = FALLBACK_COLORS
export const LANGUAGE_PALETTE_BACKGROUNDS = {
  dark: DARK_BACKGROUND,
  light: LIGHT_BACKGROUND,
} as const
