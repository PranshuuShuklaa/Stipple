import 'server-only'

import { UpstreamError } from './errors'

/**
 * GitHub computes repository statistics in a background job. Until it is
 * done the stats endpoints answer 202 (docs: "The last year of commit
 * activity", "Get all contributor commit activity"). We retry with backoff
 * up to a limit, then report pending — we never invent numbers.
 */

export interface RetryOptions {
  /** Total tries, initial included. Default 4. */
  attempts: number
  /** Delay before retry n (1-based), baseDelayMs * factor^(n-1). Default 300 ms. */
  baseDelayMs: number
  factor: number
  maxDelayMs: number
  /** Injectable so tests can capture the backoff schedule. Default: setTimeout sleep. */
  wait: (ms: number) => Promise<void>
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  attempts: 4,
  baseDelayMs: 300,
  factor: 2,
  maxDelayMs: 2000,
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export function retryDelayMs(options: RetryOptions, attempt: number): number {
  const delay = options.baseDelayMs * Math.pow(options.factor, attempt - 1)
  return Math.min(delay, options.maxDelayMs)
}

export type StatsOutcome<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'empty' }
  | { kind: 'pending' }

/**
 * Calls `requestOnce` until it answers 200 (then parses and returns ok)
 * or gives up and reports pending. 202 means "still computing" and is
 * retried with backoff; 204 means GitHub has no data at all. Any error
 * thrown by requestOnce or the parser propagates unchanged.
 *
 * `requestOnce` must only answer 200, 202 or 204 — status handling for
 * 404, 403/429 and 5xx happens before this layer.
 */
export async function fetchStatsUntilReady<T>(
  requestOnce: () => Promise<Response>,
  parse: (body: unknown) => T,
  retry: Partial<RetryOptions> = {},
): Promise<StatsOutcome<T>> {
  const options: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...retry }

  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    const response = await requestOnce()

    if (response.status === 200) {
      try {
        return { kind: 'ok', data: parse(await response.json()) }
      } catch {
        throw new UpstreamError('GitHub sent an answer we could not read.')
      }
    }

    if (response.status === 204) return { kind: 'empty' }

    if (response.status === 202 && attempt < options.attempts) {
      await options.wait(retryDelayMs(options, attempt))
    } else {
      // 202 on the last attempt, or an unexpected status: report pending.
      return { kind: 'pending' }
    }
  }

  return { kind: 'pending' }
}
