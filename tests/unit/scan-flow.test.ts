import { describe, expect, it } from 'vitest'
import type { Scan } from '@/lib/types/scan'
import {
  SCAN_LINE_CAPS,
  SCAN_REVEAL_MS,
  SCAN_STAGES,
  scanStageIndexOf,
} from '@/lib/scan-stages'
import {
  FALLBACK_FETCH_ERROR,
  MAX_WAIT_ERROR,
  NETWORK_LOST_ERROR,
  classifyFallbackFailure,
  createPlaceholderScan,
  initialScanFlowState,
  processScanFlowEvent,
  scanFlowMessage,
  sweepCreepTarget,
  sweepRevealFraction,
} from '@/features/scan-screen/scan-flow'

function fixtureScan(fileCount: number): Scan {
  return {
    owner: 'octo',
    name: 'hello',
    description: '',
    defaultBranch: 'main',
    stars: 1,
    htmlUrl: '',
    files: Array.from({ length: fileCount }, () => ({
      path: 'p', name: 'p', size: 4, language: null, folder: '(root)',
    })),
    languages: [{ name: 'TypeScript', bytes: 10 }],
    activity: [],
    contributors: [],
    commits: 0,
    health: { score: 50, checks: [] },
    dependencies: [],
    flags: { truncated: false, statsPending: false },
    scannedAt: '2026-10-24T00:00:00.000Z',
  }
}

describe('processScanFlowEvent (stream with stages)', () => {
  it('collects stages in any arrival order and keeps the highest count', () => {
    let state = initialScanFlowState()
    for (const event of [
      { type: 'stage' as const, stage: 'activity' as const },
      { type: 'stage' as const, stage: 'tree' as const, files: 509 },
      { type: 'stage' as const, stage: 'languages' as const },
    ]) {
      state = processScanFlowEvent(state, event)
    }
    expect(state.stagesCompleted).toBe(3)
    expect(state.files).toBe(509)
    expect(state.phase).toBe('streaming')
  })

  it('keeps the real file count from the tree stage for the reveal', () => {
    let state = initialScanFlowState()
    state = processScanFlowEvent(state, { type: 'stage', stage: 'tree', files: 42 })
    state = processScanFlowEvent(state, { type: 'scan-ready', scan: fixtureScan(42), source: 'stream' })
    expect(state.scan?.files.length).toBe(42)
    expect(state.files).toBe(42)
    expect(state.phase).toBe('revealing')
  })

  it('ignores stream failures after any stage event arrived (the 15s cap still guards the run)', () => {
    let state = initialScanFlowState()
    state = processScanFlowEvent(state, { type: 'stage', stage: 'tree', files: 5 })
    state = processScanFlowEvent(state, { type: 'stream-lost' })
    expect(state.phase).toBe('streaming')
  })

  it('falls back only from a silent stream: no stage events within the window', () => {
    let state = initialScanFlowState()
    state = processScanFlowEvent(state, { type: 'stream-lost' })
    expect(state.phase).toBe('fallback')
  })

  it('moves to the error state on a designed error event and never recovers silently', () => {
    let state = initialScanFlowState()
    state = processScanFlowEvent(state, { type: 'designed-error', error: { code: 'not_found', message: 'gone' } })
    expect(state.phase).toBe('error')
    expect(state.error?.code).toBe('not_found')
    state = processScanFlowEvent(state, { type: 'scan-ready', scan: fixtureScan(1), source: 'fallback' })
    expect(state.phase).toBe('error')
  })

  it('max-wait stops a silent stream and a slow fallback but never an in-flight reveal', () => {
    const stream = processScanFlowEvent(initialScanFlowState(), { type: 'max-wait', error: MAX_WAIT_ERROR })
    expect(stream.phase).toBe('error')

    let fallback = initialScanFlowState()
    fallback = processScanFlowEvent(fallback, { type: 'stream-lost' })
    fallback = processScanFlowEvent(fallback, { type: 'max-wait', error: MAX_WAIT_ERROR })
    expect(fallback.phase).toBe('error')

    let revealing = initialScanFlowState()
    revealing = processScanFlowEvent(revealing, { type: 'scan-ready', scan: fixtureScan(2), source: 'stream' })
    revealing = processScanFlowEvent(revealing, { type: 'max-wait', error: MAX_WAIT_ERROR })
    expect(revealing.phase).toBe('revealing')
  })

  it('marks the handoff once, then the retry resets everything', () => {
    let state = initialScanFlowState()
    state = processScanFlowEvent(state, { type: 'scan-ready', scan: fixtureScan(1), source: 'stream' })
    state = processScanFlowEvent(state, { type: 'reveal-finished' })
    expect(state.navigated).toBe(true)
    state = processScanFlowEvent(state, { type: 'reveal-finished' })
    expect(state.navigated).toBe(true)
    state = processScanFlowEvent(state, { type: 'retry' })
    expect(state).toEqual(initialScanFlowState())
  })
})

describe('the line never finishes before the data', () => {
  it('every stage cap without data stays below the last cap and below 1', () => {
    for (let completed = 0; completed <= SCAN_STAGES.length; completed++) {
      expect(SCAN_LINE_CAPS[completed]).toBeLessThan(1)
      expect(SCAN_LINE_CAPS[completed]).toBeGreaterThan(0)
    }
    const caps = [...SCAN_LINE_CAPS]
    for (let i = 1; i < caps.length; i++) {
      expect(caps[i]).toBeGreaterThan(caps[i - 1]!)
    }
  })

  it('the creep target is bounded by the current stage cap for any elapsed time', () => {
    for (const completed of [0, 1, 2, 3, 4]) {
      for (const ms of [0, 500, 4000, 60_000, 1_000_000]) {
        expect(sweepCreepTarget(ms, completed)).toBeLessThanOrEqual(SCAN_LINE_CAPS[completed]! + 1e-9)
      }
    }
  })

  it('the creep starts gently and grows with time', () => {
    expect(sweepCreepTarget(0, 0)).toBeCloseTo(0.02, 5)
    expect(sweepCreepTarget(1000, 0)).toBeGreaterThan(sweepCreepTarget(0, 0))
  })

  it('the reveal runs the line out to the full width inside SCAN_REVEAL_MS', () => {
    expect(sweepRevealFraction(0, 0.3)).toBeCloseTo(0.3, 5)
    expect(sweepRevealFraction(SCAN_REVEAL_MS, 0.3)).toBeCloseTo(1, 5)
    let previous = 0.3
    for (let ms = 0; ms <= SCAN_REVEAL_MS; ms += 50) {
      const value = sweepRevealFraction(ms, 0.3)
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9)
      expect(value).toBeLessThanOrEqual(1)
      previous = value
    }
  })

  it('a cached scan (all events at once) finishes the sweep in about SCAN_REVEAL_MS', () => {
    // Stage events all land inside the probe window; the line has only crept a bit.
    const crept = sweepCreepTarget(200, 4)
    expect(crept).toBeLessThanOrEqual(SCAN_LINE_CAPS[4]!)
    const fraction = sweepRevealFraction(SCAN_REVEAL_MS, crept)
    expect(fraction).toBeCloseTo(1, 5)
  })
})

describe('phase designed errors', () => {
  it('classifies a network-level fetch failure as network lost', () => {
    const lost = classifyFallbackFailure(new TypeError('Failed to fetch'))
    expect(lost.code).toBe('network_lost')
    expect(lost.message).toContain('network')

    expect(classifyFallbackFailure(new Error('answer unexpected'))).toBe(FALLBACK_FETCH_ERROR)
    expect(NETWORK_LOST_ERROR.code).toBe('network_lost')
  })
})

describe('placeholder scan builder', () => {
  it('builds gray-ready placeholder files without invented scan data', () => {
    const scan = createPlaceholderScan(240, 'octo', 'hello')
    expect(scan.files).toHaveLength(240)
    expect(scan.owner).toBe('octo')
    expect(scan.name).toBe('hello')
    for (const file of scan.files) {
      expect(file.language).toBeNull()
      expect(file.size).toBe(0)
    }
    expect(scan.languages).toEqual([])
    expect(scan.activity).toEqual([])
  })

  it('caps gigantic tree counts at 2,500 dots', () => {
    expect(createPlaceholderScan(9000, 'a', 'b').files).toHaveLength(2500)
    expect(createPlaceholderScan(0, 'a', 'b').files).toHaveLength(0)
  })
})

describe('progress copy', () => {
  it('says what the scan does at each phase without filler', () => {
    const initial = scanFlowMessage(initialScanFlowState(), 'octo', 'hello')
    expect(initial).toContain('github.com/octo/hello')

    let state = initialScanFlowState()
    state = processScanFlowEvent(state, { type: 'stage', stage: 'tree', files: 1234 })
    expect(scanFlowMessage(state, 'octo', 'hello')).toContain('1,234')

    state = processScanFlowEvent(state, { type: 'scan-ready', scan: fixtureScan(1234), source: 'stream' })
    expect(scanFlowMessage(state, 'octo', 'hello')).toContain('report')

    const fallback = processScanFlowEvent(initialScanFlowState(), { type: 'stream-lost' })
    expect(scanFlowMessage(fallback, 'octo', 'hello')).toContain('direct way')

    const errorOne = { ...initialScanFlowState(), phase: 'error' as const, error: { code: 'not_found', message: 'gone' } }
    expect(scanFlowMessage(errorOne, 'octo', 'hello')).toContain('gone')
  })
})

describe('the stage event vocabulary matches the stream', () => {
  it('indexes the four stages 1 through 4', () => {
    for (const [stageName, expected] of [
      ['tree', 1],
      ['languages', 2],
      ['activity', 3],
      ['health', 4],
    ] as Array<[string, number]>) {
      expect(scanStageIndexOf(stageName as never)).toBe(expected)
    }
  })
})
