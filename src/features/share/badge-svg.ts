import { readablePair } from './art-colors'

/**
 * The health badge: a two-part pill (label "Stipple", value = health score)
 * colored by score band with AA-tested text contrast. Pure string building,
 * so it is unit-testable without a server — the route only wires params,
 * caching and content type around it.
 */

export const BADGE_HEIGHT = 20

export type ScoreBandName = 'high' | 'mid' | 'low' | 'neutral'

export interface BadgeBand {
  name: ScoreBandName
  bg: string
  fg: string
}

// Each band is an AA pair (>= 4.5:1, asserted in tests), adapted from the
// light token palette so the badge reads on any README background.
function band(name: ScoreBandName, candidates: { bg: string; fg: string }[]): BadgeBand {
  return { name, ...readablePair(candidates) }
}

const BANDS: Record<ScoreBandName, BadgeBand> = {
  high: band('high', [
    { bg: '#0A6E4E', fg: '#F1EEFF' },
    { bg: '#0A6E4E', fg: '#1A1533' },
  ]),
  mid: band('mid', [
    { bg: '#C77700', fg: '#1A1533' },
    { bg: '#C77700', fg: '#F1EEFF' },
  ]),
  low: band('low', [
    { bg: '#BE1868', fg: '#F1EEFF' },
    { bg: '#BE1868', fg: '#1A1533' },
  ]),
  neutral: band('neutral', [
    { bg: '#51496F', fg: '#F1EEFF' },
    { bg: '#51496F', fg: '#1A1533' },
  ]),
}

const LABEL_BG = '#1A1533'
const LABEL_FG = '#F1EEFF'

export function scoreBand(score: number | null): BadgeBand {
  if (score === null || !Number.isFinite(score)) return BANDS.neutral
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  if (clamped >= 80) return BANDS.high
  if (clamped >= 50) return BANDS.mid
  return BANDS.low
}

/**
 * Escapes any text that reaches the SVG (owner/repo included). Entities are
 * encoded first so repo names can never inject markup or attributes, then
 * control characters are stripped.
 */
export function escapeXmlText(value: string): string {
  return (
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      .replace(/[\u0000-\u001F\u007F]/g, '')
  )
}

export interface BadgeSpec {
  owner: string
  repo: string
  score: number | null
}

const BADGE_FONT = 'Verdana,Geneva,DejaVu Sans,sans-serif'
const BADGE_FONT_SIZE = 11
const PAD_X = 7
const BASELINE_Y = 14

// Approximate Verdana advance widths at 11px, in px. Slightly generous, so
// text always fits inside the pill it is measured for.
const CHAR_WIDTH: Record<string, number> = {
  i: 3.5, j: 3.5, l: 3.5, t: 4.6, f: 4.4, r: 4.8, ' ': 3.6, ',': 3.4, '.': 3.4,
  I: 3.5, "'": 2.4, '/': 4.2, '-': 4.2,
}

function textWidth(text: string): number {
  let width = 0
  for (const char of text) width += CHAR_WIDTH[char] ?? 7.2
  return Math.round(width * 100) / 100
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function valueText(score: number | null): string {
  return score === null || !Number.isFinite(score) ? 'n/a' : `${clampScore(score)} / 100`
}

export interface BadgeSvg {
  svg: string
  width: number
  height: number
}

export function buildBadgeSvg(spec: BadgeSpec): BadgeSvg {
  const band = scoreBand(spec.score)
  const value = valueText(spec.score)

  const title =
    spec.score === null
      ? `${escapeXmlText(spec.owner)}/${escapeXmlText(spec.repo)} — Stipple health score not computed yet`
      : `${escapeXmlText(spec.owner)}/${escapeXmlText(spec.repo)} — Stipple health ${escapeXmlText(value)}`

  const label = 'Stipple'
  const labelW = PAD_X * 2 + textWidth(label)
  const width = Math.ceil(labelW + PAD_X * 2 + textWidth(value))
  const rx = BADGE_HEIGHT / 2

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${BADGE_HEIGHT}" ` +
    `viewBox="0 0 ${width} ${BADGE_HEIGHT}" role="img" aria-label="${title}">` +
    `<title>${title}</title>` +
    `<rect x="0" y="0" width="${width}" height="${BADGE_HEIGHT}" fill="${band.bg}" />` +
    `<rect x="0" y="0" width="${labelW}" height="${BADGE_HEIGHT}" rx="${rx}" fill="${LABEL_BG}" />` +
    `<rect x="${(labelW - rx).toFixed(2)}" y="0" width="${rx}" height="${BADGE_HEIGHT}" fill="${LABEL_BG}" />` +
    `<text x="${PAD_X}" y="${BASELINE_Y}" font-family="${BADGE_FONT}" font-size="${BADGE_FONT_SIZE}" font-weight="600" fill="${LABEL_FG}">${label}</text>` +
    `<text x="${(labelW + PAD_X).toFixed(2)}" y="${BASELINE_Y}" font-family="${BADGE_FONT}" font-size="${BADGE_FONT_SIZE}" font-weight="600" fill="${band.fg}">${value}</text>` +
    `</svg>`

  return { svg, width, height: BADGE_HEIGHT }
}
