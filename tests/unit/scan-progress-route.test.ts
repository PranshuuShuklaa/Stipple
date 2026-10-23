import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Scan } from '@/lib/types/scan'

vi.mock('@/server/cache', () => ({ getScanCached: vi.fn() }))

vi.mock('@/server/scan/scan-flight', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/scan/scan-flight')>()
  return {
    ...actual,
    runScanWithFlight: vi.fn(),
  }
})

import { GET } from '@/app/api/scan-progress/[owner]/[repo]/route'
import { getScanCached } from '@/server/cache'
import { runScanWithFlight, type ScanResult } from '@/server/scan/scan-flight'

const OWNER = 'octo'
const REPO = 'hello'

type SseEvent = { event: string; data: unknown }

function fixtureScan(fileCount: number): Scan {
  return {
    owner: OWNER,
    name: REPO,
    description: '',
    defaultBranch: 'main',
    stars: 1,
    htmlUrl: '',
    files: Array.from({ length: fileCount }, (_unused, index) => ({
      path: `f-${index}`, name: `f-${index}`, size: 4, language: null, folder: '(root)',
    })),
    languages: [],
    activity: [],
    contributors: [],
    commits: 0,
    health: { score: 50, checks: [] },
    dependencies: [],
    flags: { truncated: false, statsPending: false },
    scannedAt: '2026-10-24T00:00:00.000Z',
  }
}

async function call(owner = OWNER, repo = REPO): Promise<Response> {
  return GET(new Request('http://localhost:3000/scan'), {
    params: Promise.resolve({ owner, repo }),
  })
}

async function sseEvents(response: Response): Promise<SseEvent[]> {
  const text = await response.text()
  return text
    .split('\n\n')
    .filter((chunk) => chunk !== '')
    .map((chunk) => {
      const eventLine = chunk.split('\n').find((line) => line.startsWith('event: ')) ?? ''
      const dataLine = chunk.split('\n').find((line) => line.startsWith('data: ')) ?? ''
      return { event: eventLine.slice('event: '.length), data: JSON.parse(dataLine.slice('data: '.length)) }
    })
}

beforeEach(() => {
  vi.mocked(getScanCached).mockReset()
  vi.mocked(runScanWithFlight).mockReset()
})

describe('the scan progress stream', () => {
  it('answers with SSE headers that keep buffers out of the way', async () => {
    vi.mocked(getScanCached).mockResolvedValue({ ok: true, scan: fixtureScan(1) })
    const response = await call()
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(response.headers.get('cache-control')).toBe('no-cache, no-transform')
    expect(response.headers.get('connection')).toBe('keep-alive')
    expect(response.headers.get('x-accel-buffering')).toBe('no')
    await sseEvents(response)
  })

  it('a cache hit streams the synthesized stages and the scan, and skips the flight', async () => {
    const scan = fixtureScan(11)
    vi.mocked(getScanCached).mockResolvedValue({ ok: true, scan })
    const events = await sseEvents(await call())

    expect(events.map((e) => e.event)).toEqual(['stage', 'stage', 'stage', 'stage', 'done'])
    const stages = events.slice(0, 4) as Array<{ data: { stage: string; index: number; total: number; files?: number } }>
    expect(stages.map((e) => e.data.stage)).toEqual(['tree', 'languages', 'activity', 'health'])
    expect(stages.map((e) => e.data.index)).toEqual([1, 2, 3, 4])
    expect(stages[0]?.data.files).toBe(11)
    expect(stages[1]?.data.files).toBeUndefined()
    expect(events[4]).toEqual({ event: 'done', data: { scan } })
    expect(runScanWithFlight).not.toHaveBeenCalled()
  })

  it('a designed error held in the cache streams an error event and stops', async () => {
    const record = { ok: false as const, error: { code: 'not_found' as const, message: 'github.com/octo/hello was not found.' } }
    vi.mocked(getScanCached).mockResolvedValue(record)
    const events = await sseEvents(await call())

    expect(events).toHaveLength(1)
    expect(events[0]?.event).toBe('error')
    expect(events[0]?.data).toEqual({ error: record.error })
    expect(runScanWithFlight).not.toHaveBeenCalled()
  })

  it('when the probe is slow the route joins the flight and streams its stages', async () => {
    const scan = fixtureScan(7)
    vi.mocked(getScanCached).mockImplementation(() => new Promise(() => undefined))
    vi.mocked(runScanWithFlight).mockImplementation(async (_owner, _repo, onStage) => {
      onStage?.({ stage: 'tree', index: 1, total: 4, files: 7 })
      return { ok: true as const, scan } satisfies ScanResult
    })

    const events = await sseEvents(await call())
    expect(events.map((e) => e.event)).toEqual(['stage', 'done'])
    expect(events[0]).toMatchObject({ data: { stage: 'tree', files: 7, index: 1, total: 4 } })
    expect(events[1]).toEqual({ event: 'done', data: { scan } })
    expect(runScanWithFlight).toHaveBeenCalledTimes(1)
  })

  it('a failed flight answers an error event with the same shape as /api/repo', async () => {
    vi.mocked(getScanCached).mockImplementation(() => new Promise(() => undefined))
    const failure: ScanResult = { ok: false, error: { code: 'upstream', message: 'GitHub is having trouble right now. Try again in a few minutes.' } }
    vi.mocked(runScanWithFlight).mockResolvedValue(failure)
    const events = await sseEvents(await call())

    expect(events).toEqual([{ event: 'error', data: { error: failure.error } }])
  })

  it('invalid input answers an invalid_input error event without touching the cache', async () => {
    const events = await sseEvents(await call('has space', REPO))
    expect(events).toHaveLength(1)
    expect(events[0]?.event).toBe('error')
    expect((events[0]?.data as { error: { code: string } }).error.code).toBe('invalid_input')
    expect(getScanCached).not.toHaveBeenCalled()
    expect(runScanWithFlight).not.toHaveBeenCalled()
  })
})
