import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Scan } from '@/lib/types/scan'

vi.mock('@/server/scan/build-scan', () => ({ buildScan: vi.fn() }))

vi.mock('@/server/scan/error-response', () => ({
  knownApiErrorOf: (error: unknown) => {
    const probe = error as { code?: unknown; message?: unknown; resetAt?: unknown } | null
    if (probe && typeof probe.code === 'string' && typeof probe.message === 'string') {
      return {
        code: probe.code,
        message: probe.message,
        ...(typeof probe.resetAt === 'string' ? { resetAt: probe.resetAt } : {}),
      }
    }
    return null
  },
}))

import { buildScan, type BuildScanOptions } from '@/server/scan/build-scan'
import {
  resetScanFlightsForTests,
  runScanWithFlight,
  synthesizeScanStages,
} from '@/server/scan/scan-flight'
import type { ScanStageName } from '@/lib/scan-stages'

const OWNER = 'octo'
const REPO = 'hello'
const GENERIC = 'GitHub is having trouble right now. Try again in a few minutes.'

type StageEvent = { stage: ScanStageName; index: number; total: number; files?: number }
type StageSink = NonNullable<BuildScanOptions['onStage']>

function stageEvent(stage: ScanStageName, index: number, files?: number): StageEvent {
  return { stage, index, total: 4, ...(files === undefined ? {} : { files }) }
}

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

let recordedSink: StageSink | null = null
let settleBuild: ((scan: Scan) => void) | null = null
let failBuild: ((error: unknown) => void) | null = null

function stubBuild(): void {
  vi.mocked(buildScan).mockReset()
  vi.mocked(buildScan).mockImplementation((_owner: string, _repo: string, options?: BuildScanOptions) => {
    recordedSink = options?.onStage ?? null
    settleBuild = null
    failBuild = null
    return new Promise<Scan>((resolve, reject) => {
      settleBuild = resolve
      failBuild = reject
    })
  })
}

beforeEach(() => {
  resetScanFlightsForTests()
  recordedSink = null
  settleBuild = null
  failBuild = null
})

describe('runScanWithFlight (one build per repo per process)', () => {
  it('concurrent callers share one build; a joiner replays the stages already fired', async () => {
    stubBuild()
    const started = runScanWithFlight(OWNER, REPO)

    recordedSink?.(stageEvent('tree', 1, 9))
    recordedSink?.(stageEvent('languages', 2))

    const joinedEvents: StageEvent[] = []
    const joined = runScanWithFlight(OWNER, REPO, (event) => {
      joinedEvents.push({ ...event })
    })
    expect(buildScan).toHaveBeenCalledTimes(1)

    const built = fixtureScan(9)
    settleBuild?.(built)
    const [primary, second] = await Promise.all([started, joined])
    expect(primary).toEqual({ ok: true, scan: built } satisfies Awaited<typeof started>)
    expect(second).toEqual({ ok: true, scan: built } satisfies Awaited<typeof joined>)
    expect(joinedEvents.map((event) => event.stage)).toEqual(['tree', 'languages'])
    expect(joinedEvents[0]?.files).toBe(9)
  })

  it('a flight started without a subscriber still records full history for later listeners', async () => {
    stubBuild()
    const pending = runScanWithFlight(OWNER, REPO)
    for (const [stage, index] of [['tree', 1], ['languages', 2], ['activity', 3], ['health', 4]] as Array<[ScanStageName, number]>) {
      recordedSink?.(stageEvent(stage, index, stage === 'tree' ? 3 : undefined))
    }
    settleBuild?.(fixtureScan(3))
    const settled = await pending
    expect(settled).toEqual({ ok: true, scan: fixtureScan(3) })

    const replayed: StageEvent[] = []
    const again = await runScanWithFlight(OWNER, REPO, (event) => {
      replayed.push({ ...event })
    })
    expect(again).toEqual(settled)
    expect(replayed.map((event) => event.stage)).toEqual(['tree', 'languages', 'activity', 'health'])
    expect(replayed[0]?.files).toBe(3)
    expect(buildScan).toHaveBeenCalledTimes(1)
  })

  it('keys are case-insensitive, so Octo/HELLO never builds twice', async () => {
    stubBuild()
    const upper = runScanWithFlight('OCTO', 'Hello')
    const lower = runScanWithFlight(OWNER, REPO)
    expect(buildScan).toHaveBeenCalledTimes(1)
    settleBuild?.(fixtureScan(5))
    const [a, b] = await Promise.all([upper, lower])
    expect(a).toEqual(b)
    expect(a).toEqual({ ok: true, scan: fixtureScan(5) })
  })

  it('every subscriber of a failing flight receives the same designed record', async () => {
    stubBuild()
    const first = runScanWithFlight(OWNER, REPO)
    recordedSink?.(stageEvent('tree', 1))
    const second = runScanWithFlight(OWNER, REPO)
    failBuild?.({ code: 'rate_limited', message: 'the shared limit is used up', resetAt: '2026-10-24T01:00:00.000Z' })
    const [a, b] = await Promise.all([first, second])
    expect(a).toMatchObject({ ok: false, error: { code: 'rate_limited', message: 'the shared limit is used up', resetAt: '2026-10-24T01:00:00.000Z' } })
    expect(b).toEqual(a)
  })

  it('failures the design does not know collapse to an upstream record with the honest copy', async () => {
    stubBuild()
    const pending = runScanWithFlight(OWNER, REPO)
    failBuild?.(new Error('connection reset'))
    await expect(pending).resolves.toEqual({ ok: false, error: { code: 'upstream', message: GENERIC } })
  })
})

describe('settled flights expire after their hour', () => {
  it('a caller after the TTL starts a fresh build instead of replaying the stored scan', async () => {
    stubBuild()
    const first = runScanWithFlight(OWNER, REPO)
    settleBuild?.(fixtureScan(1))
    await first

    vi.useFakeTimers()
    try {
      vi.setSystemTime(Date.now() + 60 * 60 * 1000 + 1)
      stubBuild()
      const rebuilt = runScanWithFlight(OWNER, REPO)
      expect(vi.mocked(buildScan).mock.calls).toHaveLength(1)
      settleBuild?.(fixtureScan(7))
      expect(await rebuilt).toEqual({ ok: true, scan: fixtureScan(7) })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('synthesizeScanStages (a cached scan arrives in about a reveal)', () => {
  it('stitches four stage events, indexes 1 through 4, the tree one with the file count', () => {
    const history = synthesizeScanStages(fixtureScan(11))
    expect(history.map((event) => event.stage)).toEqual(['tree', 'languages', 'activity', 'health'])
    expect(history.map((event) => [event.index, event.total])).toEqual([
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ])
    expect(history[0]?.files).toBe(11)
    expect(history[1]).not.toHaveProperty('files')
  })
})
