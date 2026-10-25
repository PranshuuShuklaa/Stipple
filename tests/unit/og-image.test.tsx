import { describe, expect, it } from 'vitest'

import type { ReactNode } from 'react'
import type { Scan } from '@/lib/types/scan'
import { OG_FIELD_H, OG_FIELD_W, buildOgElement, fallbackOgElement, gridDots, ogDotSpecs } from '@/features/share/og-image'
import { ART_COLORS } from '@/features/share/art-colors'

function scanWithFiles(languages: (string | null)[], count: number): Scan {
  return {
    owner: 'octo',
    name: 'hello',
    description: '',
    defaultBranch: 'main',
    stars: 0,
    htmlUrl: 'https://github.com/octo/hello',
    files: Array.from({ length: count }, (_, i) => ({
      path: `src/file-${i}.ts`,
      name: `file-${i}.ts`,
      size: 10,
      language: languages[i % languages.length],
      folder: 'src',
    })),
    languages: [
      { name: 'TypeScript', bytes: 5000 },
      { name: 'CSS', bytes: 4000 },
      { name: 'JavaScript', bytes: 3000 },
      { name: 'HTML', bytes: 2000 },
      { name: 'Other', bytes: 1000 },
    ],
    activity: [],
    contributors: [],
    commits: 0,
    health: { score: 76, checks: [] },
    dependencies: [],
    flags: { truncated: false, statsPending: false },
    scannedAt: '2026-10-25T00:00:00.000Z',
  }
}

interface JsxNode {
  type: string
  props: { children?: ReactNode; style?: unknown }
}

function treeText(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return []
  if (typeof node === 'string') return [node]
  if (typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(treeText)
  const element = node as unknown as JsxNode
  if (typeof element.type !== 'string') return []
  return treeText(element.props.children)
}

function countDots(node: ReactNode): number {
  if (node === null || node === undefined || typeof node === 'boolean') return 0
  if (Array.isArray(node)) return node.reduce((sum: number, child) => sum + countDots(child), 0)
  const element = node as unknown as JsxNode
  if (typeof element.type !== 'string') return 0
  const style = element.props.style as { borderRadius?: number } | undefined
  const thisIsDot = style?.borderRadius !== undefined ? 1 : 0
  return thisIsDot + countDots(element.props.children)
}

describe('gridDots', () => {
  it('lays the 240-dot demo as a 24 by 10 grid per REFERENCE.md', () => {
    const dots = gridDots(240, OG_FIELD_W, OG_FIELD_H)
    expect(dots).toHaveLength(240)
    const rows = new Set<number>()
    for (const { y } of dots) rows.add(Math.round(y))
    expect(rows.size).toBe(10)
  })

  it('centers and bounds every dot inside the field', () => {
    const dots = gridDots(431, OG_FIELD_W, OG_FIELD_H)
    for (const { x, y, d } of dots) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(OG_FIELD_W)
      expect(y).toBeLessThanOrEqual(OG_FIELD_H)
      expect(d).toBeLessThanOrEqual(12)
    }
    expect(Math.max(...dots.map((dot) => dot.x))).toBeLessThan(OG_FIELD_W)
  })

  it('returns nothing for an empty field', () => {
    expect(gridDots(0, OG_FIELD_W, OG_FIELD_H)).toEqual([])
  })
})

describe('ogDotSpecs', () => {
  it('keeps one dot per file up to the cap', () => {
    const dots = ogDotSpecs(scanWithFiles(['TypeScript'], 240), OG_FIELD_W, OG_FIELD_H)
    expect(dots).toHaveLength(240)
  })

  it('samples evenly beyond the cap and never exceeds it', () => {
    const dots = ogDotSpecs(scanWithFiles(['TypeScript'], 3_400), OG_FIELD_W, OG_FIELD_H)
    expect(dots.length).toBeLessThanOrEqual(400)
    expect(dots.length).toBeGreaterThan(300)
  })

  it('colors dots by language index, c5 for unknown and null', () => {
    const scan = scanWithFiles(['TypeScript', 'CSS', null, 'UnknownLang', 'JavaScript'], 100)
    const dots = ogDotSpecs(scan, OG_FIELD_W, OG_FIELD_H)
    expect(dots[0].fillIndex).toBe(0)
    expect(dots[1].fillIndex).toBe(1)
    expect(dots[2].fillIndex).toBe(4)
    expect(dots[3].fillIndex).toBe(4)
    expect(dots[4].fillIndex).toBe(2)
  })

  it('returns nothing for an empty repo', () => {
    expect(ogDotSpecs(scanWithFiles([], 0), OG_FIELD_W, OG_FIELD_H)).toEqual([])
  })
})

describe('buildOgElement', () => {
  it('renders the title, score and every dot', () => {
    const scan = scanWithFiles(['TypeScript'], 240)
    const element = buildOgElement({
      owner: 'octo',
      repo: 'hello',
      score: 76,
      dots: ogDotSpecs(scan, OG_FIELD_W, OG_FIELD_H),
    })
    const text = treeText(element).join(' ')
    expect(text).toContain('octo/hello')
    expect(text).toContain('76 / 100')
    expect(text).toContain('stipple')
    expect(countDots(element)).toBe(240)
  })

  it('shows "pending" for a score that is not computed yet', () => {
    const element = buildOgElement({ owner: 'a', repo: 'b', score: null, dots: [] })
    const text = treeText(element).join(' ')
    expect(text).toContain('pending')
    expect(text).not.toContain(' / 100')
  })

  it('keeps hostile owner text inert (plain text, never markup)', () => {
    const element = buildOgElement({ owner: '<script>', repo: 'b', score: 10, dots: [] })
    const text = treeText(element).join(' ')
    expect(text).toContain('<script>/b')
  })

  it('tells the truth about an empty repo instead of drawing an empty field', () => {
    const element = buildOgElement({ owner: 'a', repo: 'b', score: 10, dots: [] })
    expect(treeText(element)).toContain('No files yet')
  })
})

describe('fallbackOgElement', () => {
  it('titles an invalid name with the page line and static dots', () => {
    const element = fallbackOgElement('octo/hello')
    const text = treeText(element).join(' ')
    expect(text).toContain('octo/hello')
    expect(text).toContain('Your repo, one dot per file.')
    expect(countDots(element)).toBe(240)
  })

  it('has a no-repo variant', () => {
    const element = fallbackOgElement(null)
    const text = treeText(element).join(' ')
    expect(text).toContain('Your repo, one dot per file.')
    expect(text).not.toContain('/')
  })
})

describe('OG art colors stay on the dark tokens', () => {
  it('background never reads as black', () => {
    expect(ART_COLORS.bg).toBe('#100C24')
  })
})
