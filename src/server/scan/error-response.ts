import 'server-only'

import type { ApiErrorCode } from '@/server/github/errors'
import { ApiError } from '@/server/github/errors'

/**
 * Maps a caught error to the response the /api/repo route sends.
 * Plain messages (DESIGN.md copy rules), no internals exposed.
 */

const EPHEMERAL_MESSAGE = 'Something went wrong while scanning this repo. Try again.'

const CODE_STATUS: Record<ApiErrorCode, number> = {
  invalid_input: 400,
  not_found: 404,
  private_or_missing: 404,
  empty_repo: 422,
  rate_limited: 429,
  upstream: 502,
}

const GENERIC_MESSAGE: Partial<Record<ApiErrorCode, string>> = {
  upstream: 'GitHub is having trouble right now. Try again in a few minutes.',
}

/** Reads the designed error from anything thrown. Duck-typed `code` beats
 * instanceof so the mapping survives error copying (e.g. across cache
 * scopes). */
export function knownApiErrorOf(error: unknown): ApiError | null {
  if (error instanceof ApiError) return error
  if (typeof error !== 'object' || error === null) return null
  const code = (error as { code?: unknown })['code']
  const message = (error as { message?: unknown })['message']
  if (typeof code === 'string' && code in CODE_STATUS && typeof message === 'string' && message !== '') {
    // Keep every other property (resetAt above all) so copied rate limit
    // errors still carry their reset time through the mapping.
    return { ...(error as Record<string, unknown>), code, message } as unknown as ApiError
  }
  return null
}

export function errorToResponse(error: unknown, now: Date = new Date()): Response {
  const known = knownApiErrorOf(error)

  const headers: Record<string, string> = {}
  if (known?.code === 'rate_limited') {
    const seconds = retryAfterSecondsFor(known, now)
    if (seconds != null) headers['retry-after'] = String(seconds)
  }

  return Response.json({ error: errorBodyOf(error) }, { status: known ? CODE_STATUS[known.code] : 502, headers })
}

/** The plain { code, message } error body the API routes send. */
export function errorBodyOf(error: unknown): { code: ApiErrorCode; message: string } {
  const known = knownApiErrorOf(error)
  if (!known) return { code: 'upstream', message: EPHEMERAL_MESSAGE }
  return { code: known.code, message: GENERIC_MESSAGE[known.code] ?? known.message }
}

function retryAfterSecondsFor(known: ApiError, now: Date): number | null {
  const duck = known as { secondsUntilReset?: (from?: Date) => number; resetAt?: unknown }
  if (typeof duck.secondsUntilReset === 'function') {
    return duck.secondsUntilReset(now)
  }
  if (typeof duck.resetAt === 'string') {
    const reset = new Date(duck.resetAt)
    if (!Number.isNaN(reset.getTime())) {
      return Math.max(0, Math.ceil((reset.getTime() - now.getTime()) / 1000))
    }
  }
  return null
}
