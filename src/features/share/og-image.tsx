import type { ReactElement } from 'react'

import type { Scan } from '@/lib/types/scan'
import { createLanguageIndexer } from '@/engine/layouts/language-colors'

import { ART_COLORS } from './art-colors'
import { scoreBand } from './badge-svg'

/**
 * The OG social image layout: dark page, repo name headline, a dot field
 * (one dot = one file, Files grid rules from REFERENCE.md, capped for
 * Satori performance) and the health score. Pure element builders so the
 * route handler stays thin and every rule here is unit-testable.
 */

export const OG_WIDTH = 1200
export const OG_HEIGHT = 630

const OG_PAD_X = 72
export const OG_FIELD_W = OG_WIDTH - OG_PAD_X * 2
export const OG_FIELD_H = 300

export const OG_MAX_DOTS = 400

const OG_DARK_FILLS = [ART_COLORS.c1, ART_COLORS.c2, ART_COLORS.c3, ART_COLORS.c4, ART_COLORS.c5] as const

const OG_FONT = "'Familjen Grotesk', sans-serif"

export interface OgDot {
  x: number
  y: number
  d: number
  fillIndex: number
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

/**
 * The Files grid for a dot count (columns / pitch / diameter rules from
 * REFERENCE.md, "Files layout for real repos"), centered in the field.
 */
export function gridDots(count: number, fieldW: number, fieldH: number): { x: number; y: number; d: number }[] {
  if (count <= 0) return []
  const columns = Math.max(24, Math.ceil(Math.sqrt(count * 2.4)))
  const rows = Math.ceil(count / columns)
  const pitch = Math.min(fieldW / (columns + 1), fieldH / (rows + 3))
  const d = Math.min(clamp(6, Math.round(fieldW / 90), 12), 0.8 * pitch)
  const firstX = (fieldW - (columns - 1) * pitch) / 2
  const firstY = (fieldH - (rows - 1) * pitch) / 2
  const dots: { x: number; y: number; d: number }[] = []
  for (let i = 0; i < count; i++) {
    dots.push({
      x: firstX + (i % columns) * pitch,
      y: firstY + Math.floor(i / columns) * pitch,
      d,
    })
  }
  return dots
}

/**
 * One dot per file for real repos, sampled evenly when a repo has more
 * files than the cap, colored by the scan's top languages.
 */
export function ogDotSpecs(scan: Scan, fieldW: number, fieldH: number): OgDot[] {
  const fileCount = scan.files.length
  if (fileCount === 0) return []
  const step = Math.ceil(fileCount / OG_MAX_DOTS)
  const positions = gridDots(Math.ceil(fileCount / step), fieldW, fieldH)
  const colorOf = createLanguageIndexer(scan)
  return positions.map((position, index) => ({
    ...position,
    fillIndex: colorOf(scan.files[index * step].language),
  }))
}

export interface OgElementSpec {
  owner: string
  repo: string
  score: number | null
  dots: OgDot[]
}

const dotStyle = (dot: OgDot) => ({
  position: 'absolute' as const,
  left: dot.x,
  top: dot.y,
  width: dot.d,
  height: dot.d,
  borderRadius: dot.d / 2,
  backgroundColor: OG_DARK_FILLS[dot.fillIndex],
})

function scoreVisual(score: number | null): { value: string; color: string } {
  if (score === null) return { value: 'pending', color: ART_COLORS.dim }
  const band = scoreBand(score)
  const darkFill = { high: ART_COLORS.c4, mid: ART_COLORS.c3, low: ART_COLORS.c2, neutral: ART_COLORS.dim }[band.name]
  return { value: `${clamp(score, 0, 100)} / 100`, color: darkFill }
}

export function buildOgElement(spec: OgElementSpec): ReactElement {
  const score = scoreVisual(spec.score)
  const title = `${spec.owner}/${spec.repo}`
  const titleSize = title.length > 34 ? 64 : 92
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: ART_COLORS.bg,
        padding: '48px 72px',
        fontFamily: OG_FONT,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', fontSize: titleSize, fontWeight: 600, letterSpacing: '-0.045em', lineHeight: 0.9, color: ART_COLORS.fg }}>
          {title}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', fontSize: 20, lineHeight: 1, color: ART_COLORS.dim, marginBottom: 6 }}>health</div>
          <div style={{ display: 'flex', fontSize: 48, lineHeight: 1, fontWeight: 600, letterSpacing: '-0.035em', color: score.color }}>{score.value}</div>
        </div>
      </div>
      <div style={{ display: 'flex', height: 2, backgroundColor: ART_COLORS.line, margin: '28px 0' }} />
      <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
        {spec.dots.length === 0 && (
          <div style={{ display: 'flex', fontSize: 30, color: ART_COLORS.dim, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            No files yet
          </div>
        )}
        {spec.dots.map((dot, index) => (
          <div key={index} style={dotStyle(dot)} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 28 }}>
        <div style={{ display: 'flex', fontSize: 28, fontWeight: 600, color: ART_COLORS.fg }}>stipple</div>
        <div style={{ display: 'flex', fontSize: 28, color: ART_COLORS.dim }}>one dot, one file</div>
      </div>
    </div>
  )
}

/** The designed fallback: works for scan failures and for invalid names. */
export function fallbackOgElement(title: string | null): ReactElement {
  const dots = gridDots(240, OG_FIELD_W, OG_FIELD_H).map((position, index) => ({
    ...position,
    fillIndex: index % OG_DARK_FILLS.length,
  }))
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: ART_COLORS.bg,
        padding: '48px 72px',
        fontFamily: OG_FONT,
      }}
    >
      <div style={{ display: 'flex', fontSize: 28, fontWeight: 600, color: ART_COLORS.fg }}>stipple</div>
      {title === null ? (
        <div style={{ display: 'flex', fontSize: 76, fontWeight: 600, letterSpacing: '-0.045em', lineHeight: 0.9, color: ART_COLORS.fg, marginTop: 'auto' }}>
          Your repo, one dot per file.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
          <div style={{ display: 'flex', fontSize: 76, fontWeight: 600, letterSpacing: '-0.045em', lineHeight: 0.9, color: ART_COLORS.fg }}>{title}</div>
          <div style={{ display: 'flex', fontSize: 32, color: ART_COLORS.dim, marginTop: 14 }}>Your repo, one dot per file.</div>
        </div>
      )}
      <div style={{ display: 'flex', position: 'relative', height: OG_FIELD_H, marginTop: 24 }}>
        {dots.map((dot, index) => (
          <div key={index} style={dotStyle(dot)} />
        ))}
      </div>
    </div>
  )
}
