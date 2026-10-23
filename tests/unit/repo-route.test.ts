import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getScanCached } from '@/server/cache'
import { GET } from '@/app/api/repo/[owner]/[repo]/route'

const fixture = vi.hoisted(() => (owner: string, repo: string) => ({
  ok: true,
  scan: {
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
    health: { score: 83, checks: [{ name: 'README', passed: true }] },
    dependencies: ['zod'],
    flags: { truncated: false, statsPending: false },
    scannedAt: '2026-10-20T00:00:00.000Z',
  },
}))

vi.mock('@/server/cache', () => ({
  getScanCached: vi.fn(async (owner: string, repo: string) => fixture(owner, repo)),
}))

function getRoute(owner: string, repo: string): Promise<Response> {
  return GET(new Request('http://localhost:3000/api/repo/x/y'), {
    params: Promise.resolve({ owner, repo }),
  })
}

const mocked = vi.mocked(getScanCached)

beforeEach(() => {
  mocked.mockClear()
})

describe('GET /api/repo/[owner]/[repo]', () => {
  it('responds 200 with the scan and no-store caching', async () => {
    const response = await getRoute('octo', 'hello')

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual(fixture('octo', 'hello').scan)
    expect(mocked).toHaveBeenCalledWith('octo', 'hello')
  })

  it('rejects bad owner and repo shapes with 400 invalid_input and never queries the cache', async () => {
    const badInputs: Array<[string, string]> = [
      ['-bad', 'hello'],
      ['double--hyphen', 'hello'],
      ['octo', '..'],
      ['octo', '.'],
      ['octo', 'bad name'],
      ['octo', 're/po'],
    ]

    for (const [owner, repo] of badInputs) {
      const response = await getRoute(owner, repo)
      expect(response.status).toBe(400)
      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('invalid_input')
    }
    expect(mocked).not.toHaveBeenCalled()
  })

  it('rejects oversized owner and repo text', async () => {
    expect((await getRoute('a'.repeat(40), 'hello')).status).toBe(400)
    expect((await getRoute('octo', 'a'.repeat(101))).status).toBe(400)
  })

  it('accepts each edge the designed shape allows', async () => {
    for (const [owner, repo] of [
      ['8-8', '.github'],
      ['a'.repeat(39), 'a'.repeat(100)],
    ] as Array<[string, string]>) {
      const response = await getRoute(owner, repo)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(fixture(owner, repo).scan)
    }
  })

  it('passes designed errors through to their statuses', async () => {
    mocked.mockResolvedValueOnce({ ok: false, error: { code: 'not_found', message: 'gone' } })

    const response = await getRoute('octo', 'hello')

    expect(response.status).toBe(404)
    const body = (await response.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('not_found')
    expect(body.error.message).toBe('gone')
  })

  it('adds Retry-After from a copied rate limit error', async () => {
    mocked.mockResolvedValueOnce({ ok: false, error: { code: 'rate_limited', message: 'used up', resetAt: '2030-01-01T00:00:00Z' } })

    const response = await getRoute('octo', 'hello')

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).not.toBeNull()
  })
})
