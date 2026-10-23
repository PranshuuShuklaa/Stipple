import 'server-only'

/**
 * Designed error states for the data layer. Each maps to one HTTP status
 * on the API routes and one plain message for the UI.
 */

export type ApiErrorCode =
  | 'not_found'
  | 'private_or_missing'
  | 'empty_repo'
  | 'rate_limited'
  | 'upstream'
  | 'invalid_input'

export abstract class ApiError extends Error {
  readonly code: ApiErrorCode

  protected constructor(code: ApiErrorCode, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

/** HTTP 404 from the API routes. */
export class NotFoundError extends ApiError {
  constructor(owner: string, repo: string) {
    super(
      'not_found',
      `We couldn't find github.com/${owner}/${repo}. Check the spelling, or make sure the repo is public.`,
    )
  }
}

/** HTTP 404 when the account exists but the repo does not resolve (private or deleted). */
export class PrivateOrMissingError extends ApiError {
  constructor(owner: string, repo: string) {
    super(
      'private_or_missing',
      `github.com/${owner}/${repo} is not accessible. The account exists, but the repo may be private or removed.`,
    )
  }
}

/** HTTP 422: the repo exists but has no commits or files yet. */
export class EmptyRepoError extends ApiError {
  constructor(owner: string, repo: string) {
    super('empty_repo', `github.com/${owner}/${repo} has no files yet. Scan it again once it has commits.`)
  }
}

/**
 * HTTP 429 with a Retry-After header. resetAt is an ISO date string
 * from the x-ratelimit-reset response header (epoch seconds).
 */
export class RateLimitedError extends ApiError {
  readonly resetAt: string

  constructor(resetAtIso: string) {
    super(
      'rate_limited',
      `The shared GitHub rate limit is used up. It resets at ${resetAtIso}.`,
    )
    this.resetAt = resetAtIso
  }

  /** Seconds until the limit resets, rounded up, minimum 0. */
  secondsUntilReset(now: Date = new Date()): number {
    return Math.max(0, Math.ceil((new Date(this.resetAt).getTime() - now.getTime()) / 1000))
  }
}

/** HTTP 502: GitHub answered with failure, the network is down, or the body is not usable. */
export class UpstreamError extends ApiError {
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super('upstream', message)
    this.status = status
  }
}

/** HTTP 400: the owner/repo text did not validate. */
export class InvalidInputError extends ApiError {
  constructor() {
    super('invalid_input', "That doesn't look like a GitHub repo. Use owner/repo, or paste the repo's URL.")
  }
}
