import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkOwnerExists,
  getCommitActivity,
  getCommunityProfile,
  getContributorStats,
  getLanguages,
  getRepo,
  getRootFileContent,
  GITHUB_API_ORIGIN,
  GITHUB_API_VERSION,
  getTree,
} from '@/server/github/github'
import { EmptyRepoError, NotFoundError, RateLimitedError, UpstreamError } from '@/server/github/errors'
import {
  base64,
  caught,
  emptyResponse,
  headersOf,
  jsonResponse,
  queueFetch,
  rawCommunityProfile,
  rawRepo,
  rawTree,
} from '../helpers/github'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getRepo', () => {
  it('requests the repo endpoint with the verified headers', async () => {
    const { fetchImpl, calls } = queueFetch([jsonResponse(200, rawRepo())])

    const repo = await getRepo({ owner: 'octo', repo: 'hello' }, { fetchImpl, token: 'token-x' })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(`${GITHUB_API_ORIGIN}/repos/octo/hello`)
    const headers = headersOf(calls[0])
    expect(headers.accept).toBe('application/vnd.github+json')
    expect(headers['x-github-api-version']).toBe(GITHUB_API_VERSION)
    expect(headers.authorization).toBe('Bearer token-x')
    expect(headers['user-agent']).toContain('stipple')

    expect(repo.name).toBe('hello')
    expect(repo.default_branch).toBe('main')
    expect(repo.stargazers_count).toBe(2153)
    expect(repo.description).toBe('My first repository on GitHub!')
    expect(repo.pushed_at).toBe('2026-10-10T00:00:00Z')
    expect(repo.license?.spdx_id).toBe('MIT')
    expect(repo.owner.login).toBe('octo')
    expect(repo.archived).toBe(false)
  })

  it('reads the archived flag and tolerates a null default branch on an empty repo', async () => {
    const { fetchImpl } = queueFetch([
      jsonResponse(200, rawRepo({ archived: true, default_branch: null })),
    ])

    const repo = await getRepo({ owner: 'octo', repo: 'hello' }, { fetchImpl })

    expect(repo.archived).toBe(true)
    expect(repo.default_branch).toBe('')
  })

  it('attaches the token from the environment when no token is passed', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'env-token')
    const { fetchImpl, calls } = queueFetch([jsonResponse(200, rawRepo())])

    await getRepo({ owner: 'octo', repo: 'hello' }, { fetchImpl })

    expect(headersOf(calls[0]).authorization).toBe('Bearer env-token')
  })

  it('sends no Authorization header when the token is null or missing', async () => {
    vi.stubEnv('GITHUB_TOKEN', '')
    const { fetchImpl, calls } = queueFetch([jsonResponse(200, rawRepo())])

    await getRepo({ owner: 'octo', repo: 'hello' }, { fetchImpl, token: null })

    expect(headersOf(calls[0]).authorization).toBeUndefined()
  })

  it('maps 404 to NotFoundError mentioning the repo', async () => {
    const { fetchImpl } = queueFetch([jsonResponse(404, { message: 'Not Found' })])

    const error = (await caught(getRepo({ owner: 'octo', repo: 'gone' }, { fetchImpl }))) as NotFoundError

    expect(error).toBeInstanceOf(NotFoundError)
    expect(error.code).toBe('not_found')
    expect(error.message).toContain('github.com/octo/gone')
  })

  it('maps the primary rate limit (403, remaining 0) to RateLimitedError with the reset time', async () => {
    const epochSeconds = 1_700_000_000
    const { fetchImpl } = queueFetch([
      jsonResponse(403, { message: 'API rate limit exceeded' }, {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(epochSeconds),
      }),
    ])

    const error = (await caught(getRepo({ owner: 'octo', repo: 'hello' }, { fetchImpl }))) as RateLimitedError

    expect(error).toBeInstanceOf(RateLimitedError)
    expect(error.code).toBe('rate_limited')
    expect(error.resetAt).toBe(new Date(epochSeconds * 1000).toISOString())
    expect(error.secondsUntilReset(new Date(epochSeconds * 1000))).toBe(0)
  })

  it('maps 429 with remaining 0 the same way', async () => {
    const { fetchImpl } = queueFetch([
      jsonResponse(429, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700' }),
    ])

    const error = await caught(getRepo({ owner: 'octo', repo: 'hello' }, { fetchImpl }))
    expect(error).toBeInstanceOf(RateLimitedError)
  })

  it('maps other 403s to UpstreamError', async () => {
    const { fetchImpl } = queueFetch([jsonResponse(403, { message: 'forbidden' })])

    const error = (await caught(getRepo({ owner: 'octo', repo: 'hello' }, { fetchImpl }))) as UpstreamError

    expect(error).toBeInstanceOf(UpstreamError)
    expect(error.code).toBe('upstream')
    expect(error.status).toBe(403)
  })

  it('maps a GitHub 5xx to UpstreamError', async () => {
    const { fetchImpl } = queueFetch([jsonResponse(502, { message: 'bad gateway' })])

    const error = (await caught(getRepo({ owner: 'octo', repo: 'hello' }, { fetchImpl }))) as UpstreamError

    expect(error.code).toBe('upstream')
    expect(error.status).toBe(502)
  })

  it('turns network failures into UpstreamError', async () => {
    const { fetchImpl } = queueFetch([
      () => {
        throw new Error('ECONNRESET')
      },
    ])

    const error = (await caught(getRepo({ owner: 'octo', repo: 'hello' }, { fetchImpl }))) as UpstreamError

    expect(error.code).toBe('upstream')
    expect(error.message).toContain('reach GitHub')
  })

  it('rejects an unusable JSON body with UpstreamError', async () => {
    const { fetchImpl } = queueFetch([
      jsonResponse(200, ['array, not an object']),
    ])

    const error = await caught(getRepo({ owner: 'octo', repo: 'hello' }, { fetchImpl }))
    expect((error as UpstreamError).code).toBe('upstream')
  })
})

describe('getTree', () => {
  it('requests the recursive tree of the branch', async () => {
    const { fetchImpl, calls } = queueFetch([jsonResponse(200, rawTree([{ path: 'README.md', type: 'blob' }]))])

    const tree = await getTree({ owner: 'octo', repo: 'hello' }, 'main', { fetchImpl })

    expect(calls[0]!.url).toBe(`${GITHUB_API_ORIGIN}/repos/octo/hello/git/trees/main?recursive=1`)
    expect(tree.truncated).toBe(false)
    expect(tree.tree).toHaveLength(1)
    expect(tree.tree[0]).toMatchObject({ path: 'README.md', type: 'blob', size: null })
  })

  it('keeps slashes inside the branch name and the truncated flag', async () => {
    const { fetchImpl, calls } = queueFetch([
      jsonResponse(200, rawTree([{ path: 'src/index.ts', type: 'blob', size: 10 }], true)),
    ])

    const tree = await getTree({ owner: 'octo', repo: 'hello' }, 'rel/5.0', { fetchImpl })

    expect(calls[0]!.url).toBe(`${GITHUB_API_ORIGIN}/repos/octo/hello/git/trees/rel/5.0?recursive=1`)
    expect(tree.truncated).toBe(true)
    expect(tree.tree[0]!.size).toBe(10)
  })

  it('maps a 404 for an empty repo to EmptyRepoError', async () => {
    const { fetchImpl } = queueFetch([jsonResponse(404, { message: 'Git Repository is empty.' })])

    const error = await caught(getTree({ owner: 'octo', repo: 'hello' }, 'main', { fetchImpl }))

    expect(error).toBeInstanceOf(EmptyRepoError)
    expect((error as EmptyRepoError).code).toBe('empty_repo')
  })

  it('maps any other 404 to UpstreamError (the branch vanished mid-scan)', async () => {
    const { fetchImpl } = queueFetch([jsonResponse(404, { message: 'Not Found' })])

    const error = await caught(getTree({ owner: 'octo', repo: 'hello' }, 'main', { fetchImpl }))
    expect((error as UpstreamError).status).toBe(404)
  })
})

describe('getLanguages', () => {
  it('returns the byte map and drops unusable rows', async () => {
    const { fetchImpl, calls } = queueFetch([
      jsonResponse(200, { TypeScript: 1200, JavaScript: 400, Broken: 'no', Empty: 0 }),
    ])

    const languages = await getLanguages({ owner: 'octo', repo: 'hello' }, { fetchImpl })

    expect(calls[0]!.url).toBe(`${GITHUB_API_ORIGIN}/repos/octo/hello/languages`)
    expect(languages).toEqual({ TypeScript: 1200, JavaScript: 400 })
  })

  it('rejects an array body with UpstreamError', async () => {
    const { fetchImpl } = queueFetch([jsonResponse(200, [])])
    const error = await caught(getLanguages({ owner: 'octo', repo: 'hello' }, { fetchImpl }))
    expect((error as UpstreamError).code).toBe('upstream')
  })

  it('treats a 204 as no language data, not an unreadable answer', async () => {
    const { fetchImpl } = queueFetch([emptyResponse(204)])
    await expect(getLanguages({ owner: 'octo', repo: 'hello' }, { fetchImpl })).resolves.toEqual({})
  })

  it('treats an empty body as no language data', async () => {
    const { fetchImpl } = queueFetch([new Response('', { status: 200 })])
    await expect(getLanguages({ owner: 'octo', repo: 'hello' }, { fetchImpl })).resolves.toEqual({})
  })
})

describe('stats endpoints', () => {
  it('getCommitActivity parses a 200 with unusable rows filtered out', async () => {
    const valid = { days: [1, 0], total: 3, week: 1700000000 }
    const { fetchImpl } = queueFetch([jsonResponse(200, [valid, { days: [], week: 'no' }, { total: 2 }])])

    const outcome = await getCommitActivity({ owner: 'octo', repo: 'hello' }, { fetchImpl, retry: { attempts: 1 } })

    expect(outcome).toEqual({ kind: 'ok', data: [valid] })
  })

  it('getContributorStats drops shapeless rows but keeps named ones', async () => {
    const valid = { author: { login: 'octo' }, total: 10, weeks: [] }
    const { fetchImpl } = queueFetch([jsonResponse(200, [valid, { total: 5 }, []])])

    const outcome = await getContributorStats({ owner: 'octo', repo: 'hello' }, { fetchImpl, retry: { attempts: 1 } })

    expect(outcome).toEqual({ kind: 'ok', data: [valid] })
  })

  it('stats endpoints fail fast on a rate limit answer, no retry', async () => {
    const { fetchImpl, calls } = queueFetch([
      jsonResponse(403, { message: 'rate limit' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '10' }),
    ])

    const error = await caught(getCommitActivity({ owner: 'octo', repo: 'hello' }, { fetchImpl }))

    expect(error).toBeInstanceOf(RateLimitedError)
    expect(calls).toHaveLength(1)
  })
})

describe('getCommunityProfile', () => {
  it('returns the profile on 200', async () => {
    const { fetchImpl, calls } = queueFetch([jsonResponse(200, rawCommunityProfile())])

    const profile = await getCommunityProfile({ owner: 'octo', repo: 'hello' }, { fetchImpl })

    expect(calls[0]!.url).toBe(`${GITHUB_API_ORIGIN}/repos/octo/hello/community/profile`)
    expect(profile?.files.readme).not.toBeNull()
    expect(profile?.files.contributing).not.toBeNull()
  })

  it('returns null on 404 (forks have no community profile)', async () => {
    const { fetchImpl } = queueFetch([jsonResponse(404, { message: 'Not Found' })])

    await expect(getCommunityProfile({ owner: 'octo', repo: 'hello' }, { fetchImpl })).resolves.toBeNull()
  })

  it('propagates designed errors on other statuses', async () => {
    const { fetchImpl } = queueFetch([
      jsonResponse(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '5' }),
    ])

    const error = await caught(getCommunityProfile({ owner: 'octo', repo: 'hello' }, { fetchImpl }))
    expect(error).toBeInstanceOf(RateLimitedError)
  })
})

describe('getRootFileContent', () => {
  it('decodes base64 content', async () => {
    const payload = base64('{"a":1}')
    const { fetchImpl, calls } = queueFetch([
      jsonResponse(200, { type: 'file', name: 'package.json', content: payload, encoding: 'base64' }),
    ])

    const text = await getRootFileContent({ owner: 'octo', repo: 'hello' }, 'package.json', 'main', { fetchImpl })

    expect(calls[0]!.url).toBe(`${GITHUB_API_ORIGIN}/repos/octo/hello/contents/package.json?ref=main`)
    expect(text).toBe('{"a":1}')
  })

  it('returns null for a missing manifest file', async () => {
    const { fetchImpl } = queueFetch([jsonResponse(404, { message: 'Not Found' })])
    await expect(
      getRootFileContent({ owner: 'octo', repo: 'hello' }, 'Cargo.toml', 'main', { fetchImpl }),
    ).resolves.toBeNull()
  })

  it('returns null when GitHub withholds the content (file over 1 MB)', async () => {
    const { fetchImpl } = queueFetch([jsonResponse(200, { type: 'file', content: null, encoding: null })])
    await expect(
      getRootFileContent({ owner: 'octo', repo: 'hello' }, 'package.json', 'main', { fetchImpl }),
    ).resolves.toBeNull()
  })
})

describe('checkOwnerExists', () => {
  it('answers true on 200 and false on 404', async () => {
    const lives = queueFetch([jsonResponse(200, { login: 'octo' })])
    const gone = queueFetch([jsonResponse(404, { message: 'Not Found' })])

    await expect(checkOwnerExists('octo', { fetchImpl: lives.fetchImpl })).resolves.toBe(true)
    await expect(checkOwnerExists('octo', { fetchImpl: gone.fetchImpl })).resolves.toBe(false)

    expect(lives.calls[0]!.url).toBe(`${GITHUB_API_ORIGIN}/users/octo`)
  })
})

describe('204 answers', () => {
  it('reports empty, not pending, when stats have no content', async () => {
    const { fetchImpl } = queueFetch([emptyResponse(204)])

    const outcome = await getCommitActivity({ owner: 'octo', repo: 'hello' }, { fetchImpl, retry: { attempts: 2 } })
    expect(outcome).toEqual({ kind: 'empty' })
  })
})
