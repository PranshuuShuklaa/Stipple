import { describe, expect, it } from 'vitest'

import { BADGE_HEIGHT, buildBadgeSvg, escapeXmlText, scoreBand } from '@/features/share/badge-svg'
import { contrastRatio } from '@/features/share/art-colors'

describe('escapeXmlText', () => {
  it('encodes every markup-significant character', () => {
    expect(escapeXmlText('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&apos;')
  })

  it('strips control characters that could split entities or tag text', () => {
    expect(escapeXmlText('a\u0000b\u001Fc\u007F')).toBe('abc')
  })
})

describe('scoreBand', () => {
  it('maps score ranges to designed bands', () => {
    expect(scoreBand(96).name).toBe('high')
    expect(scoreBand(80).name).toBe('high')
    expect(scoreBand(79).name).toBe('mid')
    expect(scoreBand(50).name).toBe('mid')
    expect(scoreBand(49).name).toBe('low')
    expect(scoreBand(0).name).toBe('low')
  })

  it('clamps, rounds and degrades gracefully', () => {
    expect(scoreBand(128).name).toBe('high')
    expect(scoreBand(-5).name).toBe('low')
    expect(scoreBand(79.4).name).toBe('mid')
    expect(scoreBand(79.6).name).toBe('high')
    expect(scoreBand(null).name).toBe('neutral')
    expect(scoreBand(Number.NaN).name).toBe('neutral')
  })

  it('every band pair passes AA normal text (4.5:1)', () => {
    for (const score of [96, 65, 10, null]) {
      const band = scoreBand(score)
      expect(contrastRatio(band.bg, band.fg)).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('buildBadgeSvg', () => {
  const badge = buildBadgeSvg({ owner: 'octo', repo: 'hello', score: 87 })

  it('is a pill of label and score with sane dimensions', () => {
    expect(badge.svg).toContain('width="')
    expect(badge.height).toBe(BADGE_HEIGHT)
    expect(badge.width).toBeGreaterThan(BADGE_HEIGHT * 3)
  })

  it('shows the Stipple label and the health score as text', () => {
    expect(badge.svg).toContain('Stipple')
    expect(badge.svg).toContain('87 / 100')
  })

  it('carries an accessible title with the repo name', () => {
    expect(badge.svg).toContain('octo/hello — Stipple health 87 / 100')
  })

  it('shows n/a on a missing score', () => {
    const missing = buildBadgeSvg({ owner: 'a', repo: 'b', score: null })
    expect(missing.svg).toContain('n/a')
    expect(missing.svg).toContain('health score not computed yet')
  })

  it('never leaks repo-name markup into the document (injection is inert)', () => {
    const hostile = buildBadgeSvg({
      owner: '<script>alert(1)</script>',
      repo: 'x" onerror=alert(2) style="',
      score: 50,
    })
    // Angle brackets and quotes are entities, so no tag or attribute can break out
    expect(hostile.svg).toContain('&lt;script&gt;')
    expect(hostile.svg).toContain('&quot;')
    expect(hostile.svg).not.toContain('<script')
    // Outside the inert (escaped) title text, the payload shows up nowhere
    const body = hostile.svg.slice(hostile.svg.indexOf('<rect'))
    expect(body).not.toContain('alert')
    expect(body).not.toContain('onerror')
    expect(body).not.toContain('onload')
  })

  it('escapes ampersands in repo names', () => {
    const amp = buildBadgeSvg({ owner: 'a&b', repo: 'c&d', score: 50 })
    expect(amp.svg).toContain('a&amp;b/c&amp;d')
  })
})

describe('contrastRatio reference values', () => {
  it('matches the WCAG canonical cases', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 0)
  })
})
