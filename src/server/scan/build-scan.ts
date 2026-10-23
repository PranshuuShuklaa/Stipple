import 'server-only'

import type { Scan } from '@/lib/types/scan'
import {
  checkOwnerExists,
  getCommitActivity,
  getCommunityProfile,
  getContributorStats,
  getLanguages,
  getRepo,
  getRootFileContent,
  getTree,
  type GithubHttpOptions,
} from '@/server/github/github'
import type {
  RawCommitActivityWeek,
  RawContributorStats,
} from '@/server/github/raw-types'
import type { ScanStageEvent, ScanStageName } from '@/lib/scan-stages'
import { SCAN_STAGE_TOTAL, scanStageIndexOf } from '@/lib/scan-stages'
import { isValidOwnerRepo } from '@/lib/repo-input'
import type { RetryOptions, StatsOutcome } from '@/server/github/retry'
import {
  InvalidInputError,
  NotFoundError,
  PrivateOrMissingError,
  RateLimitedError,
} from '@/server/github/errors'
import {
  activityFromRaw,
  commitsTotalFromRaw,
  contributorsFromRaw,
  countTreeFiles,
  createLanguageResolver,
  filesFromTree,
  healthFrom,
  languagesFromRaw,
  MANIFEST_FILES,
  parseDependencies,
} from './normalizers'

/**
 * Orchestrates one scan: repo metadata first (it names the default
 * branch), then tree, languages, statistics and community profile in
 * parallel, dependency manifests once the tree is known, and normalizes
 * everything into the one Scan type.
 *
 * Designed invariants:
 * - A rate limit answer anywhere wins over every other outcome.
 * - Repo, tree and languages are required; their failure fails the scan.
 * - Stats endpoints answer 202 while GitHub computes: after the retries
 *   run out the scan completes with statsPending = true and empty
 *   numbers. Numbers are never invented to fill a gap.
 * - The community profile is optional; its absence only narrows the
 *   health checks.
 */
export interface BuildScanOptions extends GithubHttpOptions {
  /** Backoff schedule for the 202-prone stats endpoints. */
  statsRetry?: Partial<RetryOptions>
  /** Injectable clock so tests can pin "commit in the last 30 days". */
  now?: Date
  /**
   * Progress observer for the scan sweep. Called at real pipeline
   * boundaries; observers must never break the scan, and any throw
   * from a callback is contained.
   */
  onStage?: (event: ScanStageEvent) => void
}

function anyRateLimitedError(results: PromiseSettledResult<unknown>[]): RateLimitedError | null {
  for (const result of results) {
    if (result.status === 'rejected' && result.reason instanceof RateLimitedError) {
      return result.reason
    }
  }
  return null
}

function statsData<T>(result: PromiseSettledResult<StatsOutcome<T>>, fallback: T): T {
  return result.status === 'fulfilled' && result.value.kind === 'ok' ? result.value.data : fallback
}

function statsMissing<T>(result: PromiseSettledResult<StatsOutcome<T>>): boolean {
  if (result.status === 'fulfilled') return result.value.kind === 'pending'
  // Rejected stats endpoints (network, 5xx) leave the numbers unknown too.
  return true
}

/**
 * Publishes one progress event at a real pipeline boundary. A throwing
 * observer is contained: the scan outcome is never changed by it.
 */
function emitStage(
  onStage: BuildScanOptions['onStage'],
  stage: ScanStageName,
  files?: number,
): void {
  if (!onStage) return
  const event: ScanStageEvent = {
    stage,
    index: scanStageIndexOf(stage),
    total: SCAN_STAGE_TOTAL,
    ...(files === undefined ? {} : { files }),
  }
  try {
    onStage(event)
  } catch {
    // Observers must not break the scan.
  }
}

export async function buildScan(owner: string, repo: string, options: BuildScanOptions = {}): Promise<Scan> {
  // Page URLs like /r/owner/repo skip the API route's validation, so the
  // scan itself refuses invalid names and every consumer reports the
  // same designed invalid-input state.
  if (!isValidOwnerRepo(owner, repo)) throw new InvalidInputError()

  const ref = { owner, repo }
  const now = options.now ?? new Date()

  let repoData
  try {
    repoData = await getRepo(ref, options)
  } catch (error) {
    if (error instanceof NotFoundError) {
      const accountExists = await checkOwnerExists(owner, options)
      if (accountExists) throw new PrivateOrMissingError(owner, repo)
    }
    throw error
  }

  const branch =
    repoData.default_branch && repoData.default_branch.trim() !== '' ? repoData.default_branch : 'HEAD'

  const [treeResult, languagesResult, activityResult, contributorsResult, communityResult] =
    await Promise.allSettled([
      getTree(ref, branch, options).then((tree) => {
        emitStage(options.onStage, 'tree', countTreeFiles(tree.tree))
        return tree
      }),
      getLanguages(ref, options).then((raw) => {
        emitStage(options.onStage, 'languages')
        return raw
      }),
      getCommitActivity(ref, { ...options, retry: options.statsRetry }).then((weeks) => {
        emitStage(options.onStage, 'activity')
        return weeks
      }),
      getContributorStats(ref, { ...options, retry: options.statsRetry }),
      getCommunityProfile(ref, options),
    ])

  const rateLimited = anyRateLimitedError([
    treeResult,
    languagesResult,
    activityResult,
    contributorsResult,
    communityResult,
  ])
  if (rateLimited) throw rateLimited

  // The tree and the languages are core: without either there is no report.
  if (treeResult.status === 'rejected') throw treeResult.reason
  if (languagesResult.status === 'rejected') throw languagesResult.reason

  const tree = treeResult.value
  const languagesRaw = languagesResult.value
  const community = communityResult.status === 'fulfilled' ? communityResult.value : null

  const activityWeeks = statsData(activityResult as PromiseSettledResult<StatsOutcome<RawCommitActivityWeek[]>>, [])
  const contributorRows = statsData(
    contributorsResult as PromiseSettledResult<StatsOutcome<RawContributorStats[]>>,
    [],
  )
  const statsPending =
    statsMissing(activityResult as PromiseSettledResult<StatsOutcome<RawCommitActivityWeek[]>>) ||
    statsMissing(contributorsResult as PromiseSettledResult<StatsOutcome<RawContributorStats[]>>)

  const contributors = contributorsFromRaw(contributorRows)
  const commits = statsPending ? 0 : commitsTotalFromRaw(contributorRows)

  const files = filesFromTree(tree.tree, createLanguageResolver(languagesRaw))
  const languages = languagesFromRaw(languagesRaw)

  const rootNames = new Set(
    tree.tree.filter((entry) => entry.type === 'blob' && !entry.path.includes('/')).map((entry) => entry.path),
  )
  const wanted = MANIFEST_FILES.filter((fileName) => rootNames.has(fileName))
  const manifestNames = await Promise.all(
    wanted.map(async (fileName) => {
      try {
        const text = await getRootFileContent(ref, fileName, branch, options)
        return text === null ? [] : parseDependencies(fileName, text)
      } catch {
        return []
      }
    }),
  )
  const dependencies = [...new Set(manifestNames.flat())].sort((a, b) => a.localeCompare(b))

  const health = healthFrom({
    paths: files.map((file) => file.path),
    pushedAtIso: repoData.pushed_at,
    repoLicense: repoData.license,
    community,
    now,
  })
  emitStage(options.onStage, 'health')

  return {
    owner: repoData.owner.login,
    name: repoData.name,
    description: repoData.description ?? '',
    defaultBranch: repoData.default_branch,
    stars: repoData.stargazers_count,
    htmlUrl: repoData.html_url,
    files,
    languages,
    activity: activityFromRaw(activityWeeks),
    contributors,
    commits,
    health,
    dependencies,
    flags: { truncated: tree.truncated, statsPending },
    scannedAt: now.toISOString(),
  }
}
