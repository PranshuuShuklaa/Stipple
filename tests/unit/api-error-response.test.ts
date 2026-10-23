import { describe, expect, it } from 'vitest'
import {
  EmptyRepoError,
  InvalidInputError,
  NotFoundError,
  PrivateOrMissingError,
  RateLimitedError,
  UpstreamError,
} from '@/server/github/errors'
import { errorToResponse, knownApiErrorOf } from '@/server/scan/error-response'

const NOW = new Date('2029-12-31T23:58:30Z')

async function body(response: Response): Promise<{ error: { code: string; message: string } }> {
  return (await response.json()) as { error: { code: string; message: string } }
}

describe('errorToResponse', () => {
  it('maps each designed error to its status', async () => {
    const cases: Array<[Error, number, string]> = [
      [new InvalidInputError(), 400, 'invalid_input'],
      [new NotFoundError('octo', 'gone'), 404, 'not_found'],
      [new PrivateOrMissingError('octo', 'gone'), 404, 'private_or_missing'],
      [new EmptyRepoError('octo', 'gone'), 422, 'empty_repo'],
      [new RateLimitedError('2030-01-01T00:00:00Z'), 429, 'rate_limited'],
      [new UpstreamError('internal detail', 500), 502, 'upstream'],
    ]

    for (const [error, status, code] of cases) {
      const response = errorToResponse(error, NOW)
      expect(response.status).toBe(status)
      const parsed = await body(response)
      expect(parsed.error.code).toBe(code)
    }
  })

  it('never leaks internals: upstream errors get the generic copy', async () => {
    const response = errorToResponse(new UpstreamError('secret stack hint', 500), NOW)
    const parsed = await body(response)
    expect(parsed.error.message).toBe('GitHub is having trouble right now. Try again in a few minutes.')
  })

  it('keeps the designed message for the other codes', async () => {
    const response = errorToResponse(new NotFoundError('octo', 'gone'), NOW)
    const parsed = await body(response)
    expect(parsed.error.message).toContain('github.com/octo/gone')
  })

  it('adds Retry-After for rate limits, seconds until the reset, minimum 0', async () => {
    const response = errorToResponse(new RateLimitedError('2030-01-01T00:00:00Z'), NOW)
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('90')

    const past = errorToResponse(new RateLimitedError('2000-01-01T00:00:00Z'), NOW)
    expect(past.headers.get('retry-after')).toBe('0')

    const other = errorToResponse(new NotFoundError('octo', 'gone'), NOW)
    expect(other.headers.get('retry-after')).toBeNull()
  })

  it('accepts duck-typed errors so mapping survives copying across scopes', async () => {
    const plain = { code: 'not_found', message: 'the repo is gone' }
    const response = errorToResponse(plain, NOW)
    expect(response.status).toBe(404)
    expect((await body(response)).error.message).toBe('the repo is gone')
  })

  it('computes Retry-After from a copied resetAt without the helper method', async () => {
    const plain = { code: 'rate_limited', message: 'copied', resetAt: '2030-01-01T00:00:00Z' }
    const response = errorToResponse(plain, NOW)
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('90')
  })

  it('falls back to 502 with the ephemeral message for everything unknown', async () => {
    for (const weird of [new Error('boom'), null, 'nope', { code: 'weird', message: 'x' }, undefined]) {
      const response = errorToResponse(weird, NOW)
      expect(response.status).toBe(502)
      expect((await body(response)).error.message).toBe('Something went wrong while scanning this repo. Try again.')
    }
  })

  it('ignores a copied resetAt that is not a date', async () => {
    const plain = { code: 'rate_limited', message: 'copied', resetAt: 'soon-ish' }
    const response = errorToResponse(plain, NOW)
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBeNull()
  })
})

describe('knownApiErrorOf', () => {
  it('prefers the real instance and provides secondsUntilReset only on RateLimitedError', () => {
    expect(knownApiErrorOf(null)).toBeNull()
    expect(knownApiErrorOf(new Error('x'))).toBeNull()
    const notFound = knownApiErrorOf(new NotFoundError('a', 'b'))
    expect(notFound?.code).toBe('not_found')
    const limited = knownApiErrorOf(new RateLimitedError('2030-01-01T00:00:00Z'))
    expect(typeof (limited as { secondsUntilReset?: unknown }).secondsUntilReset).toBe('function')
  })
})
