import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/card/[owner]/[repo]/route'
import { getScanCached, type ScanResult } from '@/server/cache'

const fixture = vi.hoisted(() => {
  const scan = (owner: string, repo: string, score: number) => ({
    owner,
    name: repo,
    description: 'demo',
    defaultBranch: 'main',
    stars: 5,
    htmlUrl: `https://github.com/${owner}/${repo}`,
    files: [
      { path: 'src/main.ts', name: 'main.ts', size: 150, language: 'TypeScript', folder: 'src' },
      { path: 'README.md', name: 'README.md', size: 40, language: null, folder: '(root)' },
    ],
    languages: [{ name: 'TypeScript', bytes: 150 }],
    activity: [{ week: '2026-09-28', commits: 5 }],
    contributors: [{ login: 'octo', commits: 25 }],
    commits: 25,
    health: { score, checks: [{ name: 'README', passed: true }] },
    dependencies: [],
    flags: { truncated: false, statsPending: false },
    scannedAt: '2026-10-25T00:00:00.000Z',
  })
  return { scan }
})

vi.mock('@/server/cache', () => ({
  getScanCached: vi.fn(async (owner: string, repo: string): Promise<ScanResult> => {
    return { ok: true, scan: fixture.scan(owner, repo, 91) }
  }),
}))

const mocked = vi.mocked(getScanCached)

function getCard(owner: string, repo: string): Promise<Response> {
  return GET(new Request('http://localhost:3000/api/card/x/y'), { params: Promise.resolve({ owner, repo }) })
}

beforeEach(() => {
  mocked.mockClear()
})

describe('GET /api/card/[owner]/[repo]', () => {
  it('answers 200 with an animated SVG card showing real repo stats', async () => {
    const response = await getCard('octo', 'hello')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8')
    const svg = await response.text()
    expect(svg).toContain('<svg')
    expect(svg).toContain('octo / hello')
    expect(svg).toContain('91')
    expect(svg).toContain('Files: 2')
    expect(svg).toContain('Commits: 25')
  })

  it('sets public cache headers on every card', async () => {
    const response = await getCard('octo', 'hello')
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400')
  })

  it('accepts the .svg suffix', async () => {
    const response = await getCard('octo', 'express.svg')
    const svg = await response.text()
    expect(mocked).toHaveBeenCalledWith('octo', 'express')
    expect(svg).toContain('octo / express')
  })

  it('renders fallback card for scan failure still status 200', async () => {
    mocked.mockResolvedValueOnce({ ok: false, error: { code: 'not_found', message: 'gone' } })
    const response = await getCard('nobody', 'does-not-exist')
    expect(response.status).toBe(200)
    const svg = await response.text()
    expect(svg).toContain('nobody')
    expect(svg).toContain('n/a')
  })

  it('renders fallback card for invalid repo shape', async () => {
    const response = await getCard('bad owner', 're/po')
    expect(mocked).not.toHaveBeenCalled()
    expect((await response.text())).toContain('bad owner')
  })

  it('survives unexpected cache error with fallback card', async () => {
    mocked.mockRejectedValueOnce(new Error('boom'))
    const response = await getCard('octo', 'hello')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('octo')
  })
})
