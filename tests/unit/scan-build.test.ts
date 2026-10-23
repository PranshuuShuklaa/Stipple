import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildScan } from '@/server/scan/build-scan'
import {
  EmptyRepoError,
  NotFoundError,
  PrivateOrMissingError,
  RateLimitedError,
  UpstreamError,
} from '@/server/github/errors'
import {
  API,
  base64,
  caught,
  jsonResponse,
  rawCommunityProfile,
  rawRepo,
  rawTree,
  routerFetch,
  type FetchRoute,
  type RecordedCall,
  type RouterFetch,
} from '../helpers/github'

const OWNER = 'octo'
const REPO = 'hello'
const NOW = new Date('2026-10-20T00:00:00Z')
type ScanData = Awaited<ReturnType<typeof buildScan>>

const TREE_ENTRIES = [
  { path: 'src/index.ts', type: 'blob' as const, size: 10 },
  { path: 'package.json', type: 'blob' as const, size: 40 },
  { path: 'README.md', type: 'blob' as const, size: 24 },
  { path: 'src/runtime.js', type: 'blob' as const, size: 6 },
  { path: 'usr/local/lib', type: 'tree' as const },
  { path: '.github/workflows/ci.yml', type: 'blob' as const, size: 80 },
]

const PROD_DEPS = JSON.stringify({
  dependencies: { rimraf: '^6.0.1', zod: '^3' },
  devDependencies: { typescript: '^5' },
})

function repoRoute(value: Record<string, unknown>): FetchRoute {
  return { match: (url) => url === `${API}/repos/${OWNER}/${REPO}`, respond: () => jsonResponse(200, value) }
}

function repoStatus(status: number, body: Record<string, unknown>): FetchRoute {
  return { match: (url) => url === `${API}/repos/${OWNER}/${REPO}`, respond: () => jsonResponse(status, body) }
}

function ownerRoute(status: number): FetchRoute {
  return {
    match: (url) => url === `${API}/users/${OWNER}`,
    respond: () => jsonResponse(status, status === 200 ? { login: OWNER } : { message: 'Not Found' }),
  }
}

function treeRoute(options: {
  entries?: typeof TREE_ENTRIES
  truncated?: boolean
  status?: number
  body?: Record<string, unknown>
}): FetchRoute {
  return {
    match: (url) => url.includes('/git/trees/'),
    respond: () =>
      jsonResponse(options.status ?? 200, options.body ?? rawTree(options.entries ?? TREE_ENTRIES, options.truncated)),
  }
}

function languagesRoute(value: Record<string, unknown>, status = 200): FetchRoute {
  return { match: (url) => url.includes('/languages'), respond: () => jsonResponse(status, value) }
}

function statsRoutes(
  options: {
    activity?: unknown
    activityStatus?: number
    contributors?: unknown
    contributorsStatus?: number
  } = {},
): FetchRoute[] {
  const weeks = Array.from({ length: 52 }, (_, index) => ({
    week: 1_700_000_000 + index * 604_800,
    total: index,
    days: [],
  }))
  return [
    {
      match: (url) => url.includes('/stats/commit_activity'),
      respond: () => jsonResponse(options.activityStatus ?? 200, options.activity ?? weeks),
    },
    {
      match: (url) => url.includes('/stats/contributors'),
      respond: () =>
        jsonResponse(
          options.contributorsStatus ?? 200,
          options.contributors ??
            [{ author: { login: OWNER }, total: 12, weeks: [] }, { author: null, total: 5, weeks: [] }],
        ),
    },
  ]
}

function communityRoute(status = 200, value: Record<string, unknown> | null = rawCommunityProfile()): FetchRoute {
  return {
    match: (url) => url.includes('/community/profile'),
    respond: () => jsonResponse(status, value ?? { message: 'Not Found' }),
  }
}

function contentsRoute(manifests: Record<string, string | null>): FetchRoute {
  return {
    match: (url) => url.includes('/contents/'),
    respond: (url) => {
      const name = new URL(url).pathname.split('/contents/')[1]?.split('?')[0] as string
      const text = manifests[name] ?? null
      return jsonResponse(200, {
        type: 'file',
        name,
        encoding: text === null ? null : 'base64',
        content: text === null ? null : base64(text),
      })
    },
  }
}

const NO_SUCCESS_ROUTES = [treeRoute({}), languagesRoute({}), ...statsRoutes(), communityRoute()]

type BuildOptions = Parameters<typeof buildScan>[2]

function optionsFor(router: RouterFetch, token: string | null = 'token-x', extra: Partial<BuildOptions> = {}): BuildOptions {
  return { fetchImpl: router.fetchImpl, token, now: NOW, ...extra }
}

describe('buildScan (happy path)', () => {
  let scan: ScanData
  let calls: RecordedCall[]

  beforeAll(async () => {
    const router = routerFetch([
      repoRoute(rawRepo()),
      treeRoute({}),
      languagesRoute({ JavaScript: 2000, TypeScript: 8000 }),
      ...statsRoutes(),
      communityRoute(),
      contentsRoute({ 'package.json': PROD_DEPS }),
    ])
    scan = await buildScan(OWNER, REPO, optionsFor(router))
    calls = router.calls
  })

  it('reads the repo metadata through', () => {
    expect(scan.owner).toBe(OWNER)
    expect(scan.name).toBe('hello')
    expect(scan.description).toBe('My first repository on GitHub!')
    expect(scan.defaultBranch).toBe('main')
    expect(scan.stars).toBe(2153)
    expect(scan.htmlUrl).toBe('https://github.com/octo/hello')
    expect(scan.scannedAt).toBe(NOW.toISOString())
  })

  it('normalizes files with languages and folders, trees and submodules excluded', () => {
    expect(scan.files.map((file) => file.path)).toEqual([
      'src/index.ts',
      'package.json',
      'README.md',
      'src/runtime.js',
      '.github/workflows/ci.yml',
    ])
    expect(scan.files[0]).toMatchObject({ folder: 'src', language: 'TypeScript', size: 10 })
    expect(scan.files[2]).toMatchObject({ folder: '(root)', language: null, size: 24 })
    expect(scan.files[3]).toMatchObject({ folder: 'src', language: 'JavaScript' })
  })

  it('sorts languages by bytes descending', () => {
    expect(scan.languages).toEqual([
      { name: 'TypeScript', bytes: 8000 },
      { name: 'JavaScript', bytes: 2000 },
    ])
  })

  it('keeps the last 16 weeks of activity', () => {
    expect(scan.activity).toHaveLength(16)
    expect(scan.activity[0]).toMatchObject({ commits: 36 })
    expect(scan.activity[15]).toMatchObject({ commits: 51 })
  })

  it('builds contributors and the lifetime commit total from the statistics', () => {
    expect(scan.contributors).toEqual([{ login: OWNER, commits: 12 }])
    expect(scan.commits).toBe(17)
  })

  it('reads dependencies only for manifests the tree knows about', () => {
    expect(scan.dependencies).toEqual(['rimraf', 'zod'])
    const contentsCalls = calls.filter((call) => call.url.includes('/contents/'))
    expect(contentsCalls).toHaveLength(1)
    expect(contentsCalls[0]!.url).toContain('/contents/package.json?ref=main')
  })

  it('derives the health checks and the rounded score', () => {
    expect(scan.health.checks).toEqual([
      { name: 'README', passed: true },
      { name: 'License', passed: true },
      { name: 'Tests', passed: false },
      { name: 'CI workflow', passed: true },
      { name: 'Contributing guide', passed: true },
      { name: 'Commit in the last 30 days', passed: true },
    ])
    expect(scan.health.score).toBe(83)
  })

  it('keeps the flags quiet on a complete scan', () => {
    expect(scan.flags).toEqual({ truncated: false, statsPending: false })
  })

  it('attaches the token to every request', () => {
    const withoutToken = calls.filter(
      (call) => (call.init?.headers as Record<string, string>).authorization === undefined,
    )
    expect(withoutToken).toHaveLength(0)
  })
})

describe('buildScan (designed failures)', () => {
  it('answers PrivateOrMissing when the account exists but the repo does not resolve', async () => {
    const router = routerFetch([
      repoStatus(404, { message: 'Not Found' }),
      ownerRoute(200),
      ...NO_SUCCESS_ROUTES,
      contentsRoute({}),
    ])

    const error = (await caught(buildScan(OWNER, REPO, optionsFor(router, null)))) as PrivateOrMissingError
    expect(error).toBeInstanceOf(PrivateOrMissingError)
    expect(error.message).toContain('may be private or removed')
  })

  it('answers NotFound when the account itself is gone and keeps the designed copy', async () => {
    const router = routerFetch([repoStatus(404, { message: 'Not Found' }), ownerRoute(404), ...NO_SUCCESS_ROUTES])

    const error = (await caught(buildScan(OWNER, REPO, optionsFor(router, null)))) as NotFoundError
    expect(error).toBeInstanceOf(NotFoundError)
    expect(error.message).toContain('github.com/octo/hello')
  })

  it('fails with EmptyRepo when the tree answers about an empty repository', async () => {
    const router = routerFetch([
      repoRoute(rawRepo()),
      treeRoute({ status: 404, body: { message: 'Git Repository is empty.' } }),
      languagesRoute({}),
      ...statsRoutes(),
    ])

    const error = (await caught(buildScan(OWNER, REPO, optionsFor(router, null)))) as EmptyRepoError
    expect(error).toBeInstanceOf(EmptyRepoError)
    expect(error.code).toBe('empty_repo')
  })

  it('lets a rate limit answer win over successes elsewhere', async () => {
    const router = routerFetch([
      repoRoute(rawRepo()),
      treeRoute({}),
      languagesRoute({ TypeScript: 1 }),
      {
        match: (url) => url.includes('/stats/commit_activity'),
        respond: () => jsonResponse(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1234' }),
      },
      statsRoutes()[1]!,
      communityRoute(),
    ])

    const error = (await caught(buildScan(OWNER, REPO, optionsFor(router, null)))) as RateLimitedError
    expect(error).toBeInstanceOf(RateLimitedError)
    expect(error.resetAt).toBe(new Date(1_234_000).toISOString())
  })

  it('fails when languages fail even if the tree succeeded', async () => {
    const router = routerFetch([
      repoRoute(rawRepo()),
      treeRoute({}),
      languagesRoute({}, 500),
      ...statsRoutes(),
      communityRoute(),
    ])

    const error = (await caught(buildScan(OWNER, REPO, optionsFor(router, null)))) as UpstreamError
    expect(error).toBeInstanceOf(UpstreamError)
    expect(error.status).toBe(500)
  })
})

describe('buildScan (degradations)', () => {
  const NO_WAIT = () => Promise.resolve()

  it('reports pending and empty stats after exhausting the 202 retries', async () => {
    const router = routerFetch([
      repoRoute(rawRepo()),
      treeRoute({}),
      languagesRoute({ TypeScript: 8000 }),
      { match: (url) => url.includes('/stats/commit_activity'), respond: () => jsonResponse(202, {}) },
      { match: (url) => url.includes('/stats/contributors'), respond: () => jsonResponse(202, {}) },
    ])

    const scan = await buildScan(
      OWNER,
      REPO,
      optionsFor(router, null, { statsRetry: { attempts: 3, baseDelayMs: 1, factor: 2, maxDelayMs: 2, wait: NO_WAIT } }),
    )

    expect(scan.flags.statsPending).toBe(true)
    expect(scan.activity).toEqual([])
    expect(scan.contributors).toEqual([])
    expect(scan.commits).toBe(0)

    const statsCalls = router.calls.filter((call) => call.url.includes('/stats/'))
    expect(statsCalls).toHaveLength(6)
  })

  it('keeps activity data when only contributors stay pending', async () => {
    const stats = Array.from({ length: 20 }, (_, index) => ({
      week: 1_700_000_000 + index * 604_800,
      total: index,
      days: [],
    }))
    const router = routerFetch([
      repoRoute(rawRepo()),
      treeRoute({}),
      languagesRoute({ TypeScript: 10 }),
      { match: (url) => url.includes('/stats/commit_activity'), respond: () => jsonResponse(200, stats) },
      { match: (url) => url.includes('/stats/contributors'), respond: () => jsonResponse(503, { message: 'unavailable' }) },
    ])

    const scan = await buildScan(OWNER, REPO, optionsFor(router, null))

    expect(scan.flags.statsPending).toBe(true)
    expect(scan.activity).toHaveLength(16)
    expect(scan.contributors).toEqual([])
    expect(scan.commits).toBe(0)
  })

  it('scans a fork happily and degrades health to tree-only signals', async () => {
    const router = routerFetch([
      repoRoute(rawRepo({ license: null, pushed_at: null })),
      treeRoute({}),
      languagesRoute({ TypeScript: 8000 }),
      ...statsRoutes(),
      communityRoute(404),
    ])

    const scan = await buildScan(OWNER, REPO, optionsFor(router, null))

    expect(scan.health).toEqual({
      score: 33,
      checks: [
        { name: 'README', passed: true },
        { name: 'License', passed: false },
        { name: 'Tests', passed: false },
        { name: 'CI workflow', passed: true },
        { name: 'Contributing guide', passed: false },
        { name: 'Commit in the last 30 days', passed: false },
      ],
    })
  })

  it('propagates the truncated flag of huge repos', async () => {
    const router = routerFetch([
      repoRoute(rawRepo()),
      treeRoute({ truncated: true }),
      languagesRoute({ TypeScript: 1 }),
      ...statsRoutes(),
      communityRoute(404),
    ])

    const scan = await buildScan(OWNER, REPO, optionsFor(router, null))
    expect(scan.flags.truncated).toBe(true)
  })

  it('sends no Authorization header when no token exists', async () => {
    vi.stubEnv('GITHUB_TOKEN', '')
    const router = routerFetch([
      repoRoute(rawRepo()),
      treeRoute({}),
      languagesRoute({ TypeScript: 1 }),
      ...statsRoutes(),
      communityRoute(404),
    ])

    try {
      await buildScan(OWNER, REPO, { ...optionsFor(router, null), token: null })
    } finally {
      vi.unstubAllEnvs()
    }

    const withToken = router.calls.filter(
      (call) => (call.init?.headers as Record<string, string>).authorization !== undefined,
    )
    expect(withToken).toHaveLength(0)
  })
})

describe('buildScan (stage events for the progress viewer)', () => {
  it('fires tree, languages, activity, health in order and carries the tree file count', async () => {
    const router = routerFetch([
      repoRoute(rawRepo()),
      treeRoute({}),
      languagesRoute({ JavaScript: 2000, TypeScript: 8000 }),
      ...statsRoutes(),
      communityRoute(),
      contentsRoute({ 'package.json': PROD_DEPS }),
    ])

    const stages: Array<{ stage: string; index: number; total: number; files?: number }> = []
    const scan = await buildScan(OWNER, REPO, optionsFor(router, null, {
      onStage: (event) => stages.push({ ...event }),
    }))

    expect(stages.map((event) => event.stage)).toEqual(['tree', 'languages', 'activity', 'health'])
    expect(stages.map((event) => [event.index, event.total])).toEqual([[1, 4], [2, 4], [3, 4], [4, 4]])
    expect(stages[0]?.files).toBe(scan.files.length)
    expect(stages.slice(1)).not.toContainEqual(expect.objectContaining({ files: expect.anything() }))
  })

  it('never fires events without an observer, and the scan stays identical either way', async () => {
    const withObserver = routerFetch([
      repoRoute(rawRepo()),
      treeRoute({}),
      languagesRoute({ JavaScript: 2000, TypeScript: 8000 }),
      ...statsRoutes(),
      communityRoute(),
      contentsRoute({ 'package.json': PROD_DEPS }),
    ])
    const withoutObserver = routerFetch([
      repoRoute(rawRepo()),
      treeRoute({}),
      languagesRoute({ JavaScript: 2000, TypeScript: 8000 }),
      ...statsRoutes(),
      communityRoute(),
      contentsRoute({ 'package.json': PROD_DEPS }),
    ])

    const a = await buildScan(OWNER, REPO, optionsFor(withObserver, null, { onStage: () => {} }))
    const b = await buildScan(OWNER, REPO, optionsFor(withoutObserver, null))
    expect(b).toEqual(a)
  })

  it('keeps only the stages that genuinely completed and still returns the designed error', async () => {
    const router = routerFetch([
      repoRoute(rawRepo()),
      treeRoute({}),
      languagesRoute({}, 500),
      ...statsRoutes(),
      communityRoute(),
    ])

    const stages: string[] = []
    const outcome = await caught(buildScan(OWNER, REPO, optionsFor(router, null, {
      onStage: (event) => stages.push(event.stage),
    }))) as UpstreamError

    // The languages call failed, so it never fires its stage; the activity
    // endpoint answered, so its stage did. Truthful progress, not order.
    expect(stages).toEqual(['tree', 'activity'])
    expect(outcome).toBeInstanceOf(UpstreamError)
    expect(outcome.status).toBe(500)
  })
})
