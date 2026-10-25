import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/badge/[owner]/[repo]/route'
import { getScanCached, type ScanResult } from '@/server/cache'

const fixture = vi.hoisted(() => {
  const scan = (owner: string, repo: string, score: number) => ({
    owner,
    name: repo,
    description: 'demo',
    defaultBranch: 'main',
    stars: 3,
    htmlUrl: `https://github.com/${owner}/${repo}`,
    files: [{ path: 'README.md', name: 'README.md', size: 4, language: null, folder: '(root)' }],
    languages: [{ name: 'TypeScript', bytes: 900 }],
    activity: [{ week: '2026-09-28', commits: 2 }],
    contributors: [{ login: 'octo', commits: 40 }],
    commits: 40,
    health: { score, checks: [{ name: 'README', passed: true }] },
    dependencies: [],
    flags: { truncated: false, statsPending: false },
    scannedAt: '2026-10-20T00:00:00.000Z',
  })
  return { scan }
})

vi.mock('@/server/cache', () => ({
  getScanCached: vi.fn(async (owner: string, repo: string): Promise<ScanResult> => {
    return { ok: true, scan: fixture.scan(owner, repo, 83) }
  }),
}))

const mocked = vi.mocked(getScanCached)

function getBadge(owner: string, repo: string): Promise<Response> {
  return GET(new Request('http://localhost:3000/api/badge/x/y'), { params: Promise.resolve({ owner, repo }) })
}

beforeEach(() => {
  mocked.mockClear()
})

describe('GET /api/badge/[owner]/[repo]', () => {
  it('answers 200 with an SVG that shows the real score', async () => {
    const response = await getBadge('octo', 'hello')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8')
    const svg = await response.text()
    expect(svg).toContain('<svg')
    expect(svg).toContain('Stipple')
    expect(svg).toContain('83 / 100')
    expect(svg).toContain('octo/hello — Stipple health 83 / 100')
  })

  it('sets public cache headers on every badge', async () => {
    const response = await getBadge('octo', 'hello')
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400')
  })

  it('accepts the .svg suffix DESIGN.md promises', async () => {
    const response = await getBadge('octo', 'express.svg')
    const svg = await response.text()
    expect(mocked).toHaveBeenCalledWith('octo', 'express')
    expect(svg).toContain('octo/express — Stipple health 83 / 100')
  })

  it('renders the neutral fallback badge for a failed scan, still 200', async () => {
    mocked.mockResolvedValueOnce({ ok: false, error: { code: 'not_found', message: 'gone' } })
    const response = await getBadge('nobody', 'does-not-exist')
    expect(response.status).toBe(200)
    const svg = await response.text()
    expect(svg).toContain('n/a')
    expect(svg).toContain('not computed yet')
    expect(response.headers.get('cache-control')).toContain('public')
  })

  it('renders the fallback badge for an invalid repo shape and never asks the cache', async () => {
    const response = await getBadge('bad owner', 're/po')
    expect(mocked).not.toHaveBeenCalled()
    expect((await response.text())).toContain('n/a')
  })

  it('survives an unexpected cache crash with the fallback badge', async () => {
    mocked.mockRejectedValueOnce(new Error('boom'))
    const response = await getBadge('octo', 'hello')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('n/a')
  })
})
