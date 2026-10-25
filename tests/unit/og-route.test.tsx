import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/og/[owner]/[repo]/route'
import { OG_HEIGHT, OG_WIDTH } from '@/features/share/og-image'
import { getScanCached, type ScanResult } from '@/server/cache'

const fake = vi.hoisted(() => {
  const calls: { element: unknown; options: unknown }[] = []
  const state = { throwNext: false }
  class ImageResponse {
    element: unknown
    options: unknown
    constructor(element: unknown, options: unknown) {
      if (state.throwNext) {
        state.throwNext = false
        throw new Error('satori exploded')
      }
      this.element = element
      this.options = options
      calls.push({ element, options })
    }
  }
  return { calls, state, ImageResponse }
})

vi.mock('next/og', () => ({ ImageResponse: fake.ImageResponse }))

const fixture = vi.hoisted(() => {
  const scan = (owner: string, repo: string, score: number, fileCount: number) => ({
    owner,
    name: repo,
    description: 'demo',
    defaultBranch: 'main',
    stars: 3,
    htmlUrl: `https://github.com/${owner}/${repo}`,
    files: Array.from({ length: fileCount }, (_, i) => ({
      path: `src/file-${i}.ts`,
      name: `file-${i}.ts`,
      size: 10,
      language: 'TypeScript',
      folder: 'src',
    })),
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
    return { ok: true, scan: fixture.scan(owner, repo, 71, 240) }
  }),
}))

const mocked = vi.mocked(getScanCached)

function getOg(owner: string, repo: string): Promise<Response> {
  return GET(new Request('http://localhost:3000/api/og/x/y'), { params: Promise.resolve({ owner, repo }) })
}

beforeEach(() => {
  mocked.mockClear()
  fake.calls.length = 0
  fake.state.throwNext = false
})

describe('GET /api/og/[owner]/[repo]', () => {
  it('answers with the 1200x630 dot-field image and cache headers', async () => {
    const response = await getOg('octo', 'hello')
    expect(response).toBeInstanceOf(fake.ImageResponse)
    expect(fake.calls).toHaveLength(1)
    const options = fake.calls[0].options as { width: number; height: number; headers: Record<string, string>; fonts: unknown[] }
    expect(options.width).toBe(OG_WIDTH)
    expect(options.height).toBe(OG_HEIGHT)
    expect(options.headers['cache-control']).toBe('public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400')
    expect(options.fonts.length).toBeGreaterThan(0)
  })

  it('draws the scan: title, score and one dot per file, language colored', async () => {
    await getOg('octo', 'hello')
    const element = fake.calls[0].element as { props: { children: unknown } }
    const text = JSON.stringify(element)
    expect(text).toContain('octo/hello')
    expect(text).toContain('71 / 100')
    expect(text).toContain('#9A7BFF')
  })

  it('falls back to the designed image for a failed scan, still 200', async () => {
    mocked.mockResolvedValueOnce({ ok: false, error: { code: 'rate_limited', message: 'used up' } })
    const response = await getOg('octo', 'hello')
    expect(response).toBeInstanceOf(fake.ImageResponse)
    const text = JSON.stringify(fake.calls[0].element)
    expect(text).toContain('octo/hello')
    expect(text).toContain('Your repo, one dot per file.')
  })

  it('falls back for an invalid repo shape and never asks the cache', async () => {
    const response = await getOg('bad owner', 're/po')
    expect(mocked).not.toHaveBeenCalled()
    expect(response).toBeInstanceOf(fake.ImageResponse)
    const text = JSON.stringify(fake.calls[0].element)
    expect(text).toContain('Your repo, one dot per file.')
  })

  it('survives an image-generation crash with an SVG fallback, not an error', async () => {
    fake.state.throwNext = true
    const response = await getOg('octo', 'hello')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8')
    const markup = await response.text()
    expect(markup).toContain('<svg')
    expect(markup).toContain('circle')
  })
})
