import { describe, expect, it } from 'vitest'
import { fetchStatsUntilReady, retryDelayMs } from '@/server/github/retry'
import { UpstreamError } from '@/server/github/errors'
import { caught, emptyResponse, jsonResponse, queueFetch } from '../helpers/github'

interface FakeClock {
  waits: number[]
  wait: (ms: number) => Promise<void>
  reset: () => void
}

function fakeClock(): FakeClock {
  const waits: number[] = []
  return {
    waits,
    reset: () => waits.splice(0, waits.length),
    wait: (ms) => {
      waits.push(ms)
      return Promise.resolve()
    },
  }
}

const NO_WAIT = () => Promise.resolve()

describe('fetchStatsUntilReady', () => {
  it('parses on the first 200 without waiting', async () => {
    const clock = fakeClock()
    const { fetchImpl, calls } = queueFetch([jsonResponse(200, [{ week: 1700000000, total: 4, days: [] }])])

    const outcome = await fetchStatsUntilReady(
      () => fetchImpl(`${'https://api.github.com/stats'}`),
      (body) => body,
      { attempts: 4, baseDelayMs: 300, factor: 2, maxDelayMs: 2000, wait: clock.wait },
    )

    expect(outcome).toEqual({ kind: 'ok', data: [{ week: 1700000000, total: 4, days: [] }] })
    expect(calls).toHaveLength(1)
    expect(clock.waits).toEqual([])
  })

  it('retries a 202 and succeeds on the next 200', async () => {
    const clock = fakeClock()
    const { fetchImpl, calls } = queueFetch([
      jsonResponse(202, {}),
      jsonResponse(200, 'second'),
    ])

    const outcome = await fetchStatsUntilReady(
      () => fetchImpl('https://api.github.com/stats'),
      (body) => body,
      { attempts: 4, baseDelayMs: 300, factor: 2, maxDelayMs: 2000, wait: clock.wait },
    )

    expect(outcome).toEqual({ kind: 'ok', data: 'second' })
    expect(calls).toHaveLength(2)
    expect(clock.waits).toEqual([300])
  })

  it('gives up after the last attempt and reports pending, never invented data', async () => {
    const clock = fakeClock()
    const { fetchImpl, calls } = queueFetch([jsonResponse(202, {})])

    const outcome = await fetchStatsUntilReady(
      () => fetchImpl('https://api.github.com/stats'),
      (body) => body,
      { attempts: 4, baseDelayMs: 300, factor: 2, maxDelayMs: 2000, wait: clock.wait },
    )

    expect(outcome).toEqual({ kind: 'pending' })
    expect(calls).toHaveLength(4)
    expect(clock.waits).toEqual([300, 600, 1200])
  })

  it('caps the backoff at maxDelayMs', async () => {
    const clock = fakeClock()
    const { fetchImpl } = queueFetch([jsonResponse(202, {})])

    await fetchStatsUntilReady(
      () => fetchImpl('https://api.github.com/stats'),
      (body) => body,
      { attempts: 4, baseDelayMs: 3000, factor: 2, maxDelayMs: 2000, wait: clock.wait },
    )

    expect(clock.waits).toEqual([2000, 2000, 2000])
  })

  it('reports empty for 204 without waiting', async () => {
    const clock = fakeClock()
    const { fetchImpl, calls } = queueFetch([emptyResponse(204)])

    const outcome = await fetchStatsUntilReady(
      () => fetchImpl('https://api.github.com/stats'),
      (body) => body,
      { attempts: 4, baseDelayMs: 300, factor: 2, maxDelayMs: 2000, wait: clock.wait },
    )

    expect(outcome).toEqual({ kind: 'empty' })
    expect(calls).toHaveLength(1)
    expect(clock.waits).toEqual([])
  })

  it('propagates errors thrown by requestOnce', async () => {
    const clock = fakeClock()

    const error = await caught(
      fetchStatsUntilReady(
        () => Promise.reject(new UpstreamError('boom')),
        (body) => body,
        { attempts: 4, baseDelayMs: 1, factor: 2, maxDelayMs: 2, wait: clock.wait },
      ),
    )

    expect(error).toBeInstanceOf(UpstreamError)
    expect((error as UpstreamError).message).toBe('boom')
  })

  it('treats unexpected statuses as pending; the client layer translates rate limits', async () => {
    const clock = fakeClock()
    const { fetchImpl, calls } = queueFetch([
      jsonResponse(403, { message: 'rate limit' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '10' }),
    ])

    const outcome = await fetchStatsUntilReady(
      () => fetchImpl('https://api.github.com/stats'),
      (body) => body,
      { attempts: 4, baseDelayMs: 10, factor: 2, maxDelayMs: 20, wait: clock.wait },
    )

    expect(outcome).toEqual({ kind: 'pending' })
    expect(calls).toHaveLength(1)
    expect(clock.waits).toEqual([])
  })

  it('rejects a real 200 whose body is not JSON as unreadable', async () => {
    const clock = fakeClock()
    const { fetchImpl, calls } = queueFetch([new Response('%%%', { status: 200 })])

    const error = await caught(
      fetchStatsUntilReady(
        () => fetchImpl('https://api.github.com/stats'),
        (body) => body as never,
        { attempts: 4, baseDelayMs: 10, factor: 2, maxDelayMs: 20, wait: clock.wait },
      ),
    )

    expect(error).toBeInstanceOf(UpstreamError)
    expect(calls).toHaveLength(1)
  })
})

describe('retryDelayMs', () => {
  it('grows base * factor^(n-1) and respects the cap', () => {
    const options = { attempts: 6, baseDelayMs: 100, factor: 2, maxDelayMs: 500, wait: NO_WAIT }
    expect(retryDelayMs(options, 1)).toBe(100)
    expect(retryDelayMs(options, 2)).toBe(200)
    expect(retryDelayMs(options, 3)).toBe(400)
    expect(retryDelayMs(options, 4)).toBe(500)
    expect(retryDelayMs(options, 5)).toBe(500)
  })
})
