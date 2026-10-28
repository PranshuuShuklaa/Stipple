import { describe, expect, it } from 'vitest'
import { buildCardSvg, cardSpecFromScan, fallbackCardSpec } from '@/features/share/card-svg'
import type { Scan } from '@/lib/types/scan'

const mockScan: Scan = {
  owner: 'octo',
  name: 'hello',
  description: 'Test repository',
  defaultBranch: 'main',
  stars: 12,
  htmlUrl: 'https://github.com/octo/hello',
  files: [
    { path: 'src/index.ts', name: 'index.ts', size: 100, language: 'TypeScript', folder: 'src' },
    { path: 'src/app.ts', name: 'app.ts', size: 200, language: 'TypeScript', folder: 'src' },
    { path: 'README.md', name: 'README.md', size: 50, language: null, folder: '(root)' },
  ],
  languages: [
    { name: 'TypeScript', bytes: 300 },
  ],
  activity: [
    { week: '2026-09-28', commits: 5 },
  ],
  contributors: [
    { login: 'octo', commits: 10 },
  ],
  commits: 42,
  health: {
    score: 88,
    checks: [{ name: 'README', passed: true }],
  },
  dependencies: ['zod'],
  flags: { truncated: false, statsPending: false },
  scannedAt: '2026-10-25T00:00:00.000Z',
}

describe('card-svg generator', () => {
  it('builds an SVG with title, desc, and CSS keyframes for dots and health ring', () => {
    const spec = cardSpecFromScan(mockScan)
    const result = buildCardSvg(spec)

    expect(result.svg).toContain('<svg')
    expect(result.svg).toContain('octo/hello')
    expect(result.svg).toContain('<title>')
    expect(result.svg).toContain('<desc>')
    expect(result.svg).toContain('@media (prefers-color-scheme: dark)')
    expect(result.svg).toContain('@media (prefers-reduced-motion: reduce)')
    expect(result.svg).toContain('class="dot c')
    expect(result.svg).not.toMatch(/<circle[^>]*class="dot [^"]*"[^>]*\bfill=/)
    expect(result.svg).toContain('dotAssemble')
    expect(result.svg).toContain('ringDraw')
    expect(result.svg).toContain('Files: 3')
    expect(result.svg).toContain('Commits: 42')
    expect(result.svg).toContain('88')
    expect(result.width).toBe(600)
    expect(result.height).toBe(240)
  })

  it('builds a fallback card spec correctly', () => {
    const fallback = fallbackCardSpec('nobody', 'missing')
    const result = buildCardSvg(fallback)

    expect(result.svg).toContain('nobody')
    expect(result.svg).toContain('missing')
    expect(result.svg).toContain('n/a')
  })

  it('escapes owner, repo, and language text exactly once', () => {
    const spec = fallbackCardSpec('a&b', 'c<d')
    spec.languages = [{ name: 'C&C++', percent: 100, colorKey: 'c1' }]
    const { svg } = buildCardSvg(spec)

    expect(svg).toContain('a&amp;b / c&lt;d')
    expect(svg).toContain('C&amp;C++')
    expect(svg).not.toContain('a&amp;amp;b')
    expect(svg).not.toContain('C&amp;amp;C++')
  })
})
