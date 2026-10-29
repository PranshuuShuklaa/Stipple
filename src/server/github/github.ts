import 'server-only'

import {
  ApiError,
  EmptyRepoError,
  NotFoundError,
  RateLimitedError,
  UpstreamError,
} from './errors'
import type {
  RawCommitActivityWeek,
  RawCommunityProfile,
  RawContributorStats,
  RawLanguages,
  RawRepo,
  RawTree,
} from './raw-types'
import { fetchStatsUntilReady, type RetryOptions, type StatsOutcome } from './retry'

/**
 * Typed GitHub REST API client. Server only: the token from
 * GITHUB_TOKEN is attached here and never leaves the server.
 *
 * Endpoints used, all verified in the GitHub REST docs
 * (docs.github.com/en/rest) and the official api.github.com OpenAPI:
 * - GET /repos/{owner}/{repo}                       (repo metadata)
 * - GET /repos/{owner}/{repo}/git/trees/{ref}?recursive=1
 * - GET /repos/{owner}/{repo}/languages
 * - GET /repos/{owner}/{repo}/stats/commit_activity (200/202/204)
 * - GET /repos/{owner}/{repo}/stats/contributors    (200/202/204)
 * - GET /repos/{owner}/{repo}/community/profile
 * - GET /repos/{owner}/{repo}/contents/{path}       (dependency manifests)
 * - GET /users/{username}                           (error-path probe only)
 */

export const GITHUB_API_ORIGIN = 'https://api.github.com'
export const GITHUB_API_VERSION = '2022-11-28'

/** One request may not hang longer than this. The route layer has its own budget. */
export const DEFAULT_TIMEOUT_MS = 15_000

export type FetchLike = typeof globalThis.fetch

export interface GithubHttpOptions {
  /** Injectable for tests. Default: globalThis.fetch. */
  fetchImpl?: FetchLike
  /**
   * Token override for tests. Null deliberately disables the Authorization
   * header; undefined falls back to process.env.GITHUB_TOKEN.
   */
  token?: string | null
  timeoutMs?: number
}

export interface GithubRepoRef {
  owner: string
  repo: string
}

export interface StatsHttpOptions extends GithubHttpOptions {
  retry?: Partial<RetryOptions>
}

const USER_AGENT = 'stipple (github.com/PranshuShuklaa/Stipple)'

function resolveToken(token: GithubHttpOptions['token']): string | null {
  if (token === null) return null
  if (token !== undefined && token.trim() !== '') return token.trim()
  const envToken = process.env['GITHUB_TOKEN']
  return envToken && envToken.trim() !== '' ? envToken.trim() : null
}

function enc(value: string): string {
  return encodeURIComponent(value)
}

/** Git refs (branch names) may contain slashes; only hostile characters are removed. */
function safeRef(name: string): string {
  return name.replace(/[^\w.\-/]+/g, '')
}

function repoPath(ref: GithubRepoRef, suffix: string): string {
  return `/repos/${enc(ref.owner)}/${enc(ref.repo)}${suffix}`
}

async function errorMessageBody(res: Response): Promise<string> {
  try {
    const raw = (await res.json()) as { message?: unknown }
    return typeof raw?.message === 'string' ? raw.message : ''
  } catch {
    return ''
  }
}

/**
 * Maps every non-2xx response to a designed error. The primary rate limit
 * rule from the docs: 403 or 429 with x-ratelimit-remaining: 0; do not
 * retry before x-ratelimit-reset.
 */
export async function mapStatusToError(res: Response, ref: GithubRepoRef): Promise<ApiError> {
  const remaining = res.headers.get('x-ratelimit-remaining')
  const resetAt = res.headers.get('x-ratelimit-reset')
  if ((res.status === 403 || res.status === 429) && remaining === '0') {
    const epoch = Number(resetAt)
    if (Number.isFinite(epoch)) return new RateLimitedError(new Date(epoch * 1000).toISOString())
    return new UpstreamError('GitHub is limiting requests, and the reset time was not readable.', res.status)
  }

  switch (res.status) {
    case 404:
      return new NotFoundError(ref.owner, ref.repo)
    case 401:
      return new UpstreamError(
        'GitHub rejected the credentials stored on the server. The token in .env.local may be invalid or expired.',
        401,
      )
    case 403:
    case 429:
      return new UpstreamError('GitHub is limiting requests. Try again shortly.', res.status)
    default:
      if (res.status >= 500) return new UpstreamError('GitHub is having trouble right now.', res.status)
      return new UpstreamError('GitHub answered in an unexpected way.', res.status)
  }
}

/**
 * Performs one GET against api.github.com. Any network failure (including
 * the request timeout) becomes UpstreamError. Non-2xx responses still
 * resolve; call sites decide (mapStatusToError or custom handling).
 */
export async function githubRaw(path: string, ref: GithubRepoRef, options: GithubHttpOptions = {}): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const token = resolveToken(options.token)

  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': GITHUB_API_VERSION,
    'user-agent': USER_AGENT,
  }
  if (token) headers.authorization = `Bearer ${token}`

  try {
    return await fetchImpl.call(globalThis, `${GITHUB_API_ORIGIN}${path}`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      // The data cache layer decides caching; the client itself never caches.
      cache: 'no-store',
      redirect: 'follow',
    })
  } catch {
    throw new UpstreamError('We could not reach GitHub. Check the connection, or try again later.')
  }
}

/** githubRaw plus automatic error mapping for non-2xx statuses. */
async function githubRequest(path: string, ref: GithubRepoRef, options: GithubHttpOptions = {}): Promise<Response> {
  const res = await githubRaw(path, ref, options)
  if (!res.ok) throw await mapStatusToError(res, ref)
  return res
}

function assertObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new UpstreamError('GitHub sent an answer we could not read.')
  }
  return value as Record<string, unknown>
}

function readString(object: Record<string, unknown>, key: string): string {
  const value = object[key]
  if (typeof value !== 'string') throw new UpstreamError('GitHub sent an answer we could not read.')
  return value
}

function readNumber(object: Record<string, unknown>, key: string): number {
  const value = object[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new UpstreamError('GitHub sent an answer we could not read.')
  }
  return value
}

/**
 * GET /repos/{owner}/{repo} — repository metadata.
 * A repository rename answers with a redirect that fetch follows, so the
 * data is for the current name and the stable html_url of the new name.
 */
export async function getRepo(ref: GithubRepoRef, options: GithubHttpOptions = {}): Promise<RawRepo> {
  const res = await githubRequest(repoPath(ref, ''), ref, options)
  const body = assertObject(await res.json())
  const owner = assertObject(body['owner'])
  return {
    name: readString(body, 'name'),
    full_name: readString(body, 'full_name'),
    description: (body['description'] as string | null) ?? null,
    // An empty repository can still report a null default branch; the
    // scan falls back to HEAD, so a missing name is not an upstream error.
    default_branch: typeof body['default_branch'] === 'string' ? body['default_branch'] : '',
    stargazers_count: readNumber(body, 'stargazers_count'),
    html_url: readString(body, 'html_url'),
    archived: body['archived'] === true,
    pushed_at: (body['pushed_at'] as string | null) ?? null,
    license: body['license']
      ? {
          key: readString(body['license'] as Record<string, unknown>, 'key'),
          name: readString(body['license'] as Record<string, unknown>, 'name'),
          spdx_id: ((body['license'] as Record<string, unknown>)['spdx_id'] as string | null) ?? null,
        }
      : null,
    owner: { login: readString(owner, 'login') },
  }
}

/**
 * GET /repos/{owner}/{repo}/git/trees/{ref}?recursive=1.
 * A 404 carrying "Git Repository is empty." means the repo has no
 * commits; any other 404 means the branch vanished mid-scan.
 */
export async function getTree(ref: GithubRepoRef, branch: string, options: GithubHttpOptions = {}): Promise<RawTree> {
  const suffix = `/git/trees/${safeRef(branch)}?recursive=1`
  const res = await githubRaw(repoPath(ref, suffix), ref, options)

  if (res.status === 404) {
    const message = await errorMessageBody(res)
    if (message.toLowerCase().includes('empty')) throw new EmptyRepoError(ref.owner, ref.repo)
    throw new UpstreamError(
      `The branch "${branch}" disappeared while this scan was running.`,
      404,
    )
  }
  if (!res.ok) throw await mapStatusToError(res, ref)

  const body = assertObject(await res.json())
  const entries = body['tree']
  if (!Array.isArray(entries)) throw new UpstreamError('GitHub sent an answer we could not read.')
  return {
    sha: (body['sha'] as string) ?? '',
    truncated: body['truncated'] === true,
    tree: (entries as Record<string, unknown>[]).map((entry) => ({
      path: (entry['path'] as string) ?? '',
      mode: (entry['mode'] as string) ?? '',
      type: (entry['type'] as 'blob' | 'tree' | 'commit') ?? 'blob',
      sha: (entry['sha'] as string) ?? '',
      size: typeof entry['size'] === 'number' ? entry['size'] : null,
      url: (entry['url'] as string) ?? '',
    })),
  }
}

/** GET /repos/{owner}/{repo}/languages — language name to byte count. */
export async function getLanguages(ref: GithubRepoRef, options: GithubHttpOptions = {}): Promise<RawLanguages> {
  const res = await githubRequest(repoPath(ref, '/languages'), ref, options)
  // GitHub answers 204 for repos with no counted language bytes. That is a
  // designed "no languages" state, not an unreadable answer.
  if (res.status === 204) return {}
  const text = await res.text()
  if (text.trim() === '') return {}
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new UpstreamError('GitHub sent an answer we could not read.')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new UpstreamError('GitHub sent an answer we could not read.')
  }
  const languages: RawLanguages = {}
  for (const [name, bytes] of Object.entries(body as RawLanguages)) {
    if (typeof bytes === 'number' && Number.isFinite(bytes) && bytes > 0) languages[name] = bytes
  }
  return languages
}

/**
 * Stats endpoints see raw statuses; a rate limit answer must reject so
 * buildScan can give it priority. Everything else flows to the retry
 * layer, which treats unexpected statuses as pending.
 */
async function statsRequest(path: string, ref: GithubRepoRef, options: GithubHttpOptions): Promise<Response> {
  const res = await githubRaw(path, ref, options)
  if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
    throw await mapStatusToError(res, ref)
  }
  return res
}

function parseCommitActivity(body: unknown): RawCommitActivityWeek[] {
  if (!Array.isArray(body)) throw new UpstreamError('GitHub sent an answer we could not read.')
  return body.filter(
    (week): week is RawCommitActivityWeek =>
      typeof week === 'object' &&
      week !== null &&
      typeof (week as RawCommitActivityWeek)['week'] === 'number' &&
      typeof (week as RawCommitActivityWeek)['total'] === 'number',
  )
}

/**
 * GET /repos/{owner}/{repo}/stats/commit_activity — the last year of
 * commits grouped per week. Answers 202 while GitHub computes, so this
 * is retried with backoff and reports pending instead of inventing data.
 */
export async function getCommitActivity(
  ref: GithubRepoRef,
  options: StatsHttpOptions = {},
): Promise<StatsOutcome<RawCommitActivityWeek[]>> {
  return fetchStatsUntilReady(
    () => statsRequest(repoPath(ref, '/stats/commit_activity'), ref, options),
    parseCommitActivity,
    options.retry,
  )
}

function parseContributorStats(body: unknown): RawContributorStats[] {
  if (!Array.isArray(body)) throw new UpstreamError('GitHub sent an answer we could not read.')
  return body.filter(
    (contributor): contributor is RawContributorStats =>
      typeof contributor === 'object' &&
      contributor !== null &&
      typeof (contributor as RawContributorStats)['total'] === 'number' &&
      Array.isArray((contributor as RawContributorStats)['weeks']),
  )
}

/**
 * GET /repos/{owner}/{repo}/stats/contributors — per-author lifetime
 * commit totals plus weekly buckets. 202-prone like all stats endpoints;
 * retried with backoff, pending when GitHub is still computing.
 */
export async function getContributorStats(
  ref: GithubRepoRef,
  options: StatsHttpOptions = {},
): Promise<StatsOutcome<RawContributorStats[]>> {
  return fetchStatsUntilReady(
    () => statsRequest(repoPath(ref, '/stats/contributors'), ref, options),
    parseContributorStats,
    options.retry,
  )
}

/**
 * GET /repos/{owner}/{repo}/community/profile — community health files.
 * Forks and some repos answer 404; that is a missing profile, not an
 * error, so this returns null.
 */
export async function getCommunityProfile(
  ref: GithubRepoRef,
  options: GithubHttpOptions = {},
): Promise<RawCommunityProfile | null> {
  const res = await githubRaw(repoPath(ref, '/community/profile'), ref, options)
  if (res.status === 404) return null
  if (!res.ok) throw await mapStatusToError(res, ref)
  return (await res.json()) as RawCommunityProfile
}

/**
 * GET /repos/{owner}/{repo}/contents/{path} — one file at the repo root,
 * decoded from base64. Returns null for a missing or oversized file
 * (contents over 1 MB have no inline content).
 */
export async function getRootFileContent(
  ref: GithubRepoRef,
  fileName: string,
  branch: string,
  options: GithubHttpOptions = {},
): Promise<string | null> {
  const suffix = `/contents/${enc(fileName)}?ref=${enc(branch)}`
  const res = await githubRaw(repoPath(ref, suffix), ref, options)
  if (res.status === 404) return null
  if (!res.ok) throw await mapStatusToError(res, ref)

  const body = assertObject(await res.json())
  if (body['type'] !== 'file') return null
  const content = body['content']
  if (typeof content !== 'string') return null

  const encoding = body['encoding']
  if (encoding === 'base64') {
    return Buffer.from(content, 'base64').toString('utf8')
  }
  if (encoding === 'none') return content
  return null
}

/**
 * GET /users/{username} — exists only to tell "the account is gone"
 * (NotFoundError) from "the account exists but the repo is private or
 * removed" (PrivateOrMissingError) when the repo call answers 404.
 */
export async function checkOwnerExists(owner: string, options: GithubHttpOptions = {}): Promise<boolean> {
  const ref: GithubRepoRef = { owner, repo: owner }
  const res = await githubRaw(`/users/${enc(owner)}`, ref, options)
  if (res.status === 404) return false
  if (!res.ok) throw await mapStatusToError(res, ref)
  return true
}
