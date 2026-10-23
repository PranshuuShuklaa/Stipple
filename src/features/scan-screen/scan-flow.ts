import type { Scan } from '@/lib/types/scan'
import {
  SCAN_FALLBACK_AFTER_MS,
  SCAN_MAX_WAIT_MS,
  SCAN_REVEAL_MS,
  SCAN_STAGES,
  scanStageCap,
  scanStageIndexOf,
  type ScanStageName,
} from '@/lib/scan-stages'

/**
 * Pure state machine for the scan screen (Phase 5b): stream, fallback,
 * reveal, error. No timers, no fetches, no EventSource — the component
 * feeds events in and renders the state out. Guards live inside the
 * transitions so late or duplicated events can never break the flow.
 */

export const SCAN_FLOW = {
  fallbackAfterMs: SCAN_FALLBACK_AFTER_MS,
  maxWaitMs: SCAN_MAX_WAIT_MS,
  revealMs: SCAN_REVEAL_MS,
  /** Slow forward creep of the sweep line while waiting for events. */
  creepPerMs: 0.000055,
  creepStart: 0.02,
} as const

export type ScanScreenPhase = 'streaming' | 'fallback' | 'revealing' | 'error'

export interface DesignedError {
  code: string
  message: string
}

export interface ScanFlowState {
  phase: ScanScreenPhase
  stagesCompleted: number
  files: number | null
  scan: Scan | null
  source: 'stream' | 'fallback' | null
  error: DesignedError | null
  navigated: boolean
}

export type ScanFlowEvent =
  | { type: 'stage'; stage: ScanStageName; files?: number }
  | { type: 'scan-ready'; scan: Scan; source: 'stream' | 'fallback' }
  | { type: 'stream-lost' }
  | { type: 'designed-error'; error: DesignedError }
  | { type: 'max-wait'; error: DesignedError }
  | { type: 'reveal-finished' }
  | { type: 'retry' }

export const MAX_WAIT_ERROR: DesignedError = {
  code: 'upstream',
  message: 'The scan took longer than 15 seconds without an answer. Try again.',
}

export function initialScanFlowState(): ScanFlowState {
  return {
    phase: 'streaming',
    stagesCompleted: 0,
    files: null,
    scan: null,
    source: null,
    error: null,
    navigated: false,
  }
}

export function processScanFlowEvent(state: ScanFlowState, event: ScanFlowEvent): ScanFlowState {
  switch (event.type) {
    case 'retry':
      return initialScanFlowState()

    case 'stage': {
      if (state.phase !== 'streaming') return state
      const stagesCompleted = Math.max(state.stagesCompleted, scanStageIndexOf(event.stage))
      const files = event.stage === 'tree' && typeof event.files === 'number' ? event.files : state.files
      return { ...state, stagesCompleted, files }
    }

    case 'scan-ready': {
      if (state.phase === 'error' || state.phase === 'revealing') return state
      return {
        ...state,
        phase: 'revealing',
        scan: event.scan,
        source: event.source,
        stagesCompleted: Math.max(state.stagesCompleted, SCAN_STAGES.length),
        files: state.files ?? event.scan.files.length,
      }
    }

    case 'stream-lost': {
      if (state.phase !== 'streaming' || state.stagesCompleted > 0) return state
      return { ...state, phase: 'fallback' }
    }

    case 'designed-error': {
      if (state.phase === 'error' || state.phase === 'revealing') return state
      return { ...state, phase: 'error', error: event.error }
    }

    case 'max-wait': {
      if (state.phase === 'error' || state.phase === 'revealing') return state
      return { ...state, phase: 'error', error: event.error }
    }

    case 'reveal-finished': {
      if (state.phase !== 'revealing' || state.navigated) return state
      return { ...state, navigated: true }
    }
  }
}

/** Progress copy for the aria-live status line. */
export function scanFlowMessage(state: ScanFlowState, owner: string, repo: string): string {
  const at = `github.com/${owner}/${repo}`
  switch (state.phase) {
    case 'streaming': {
      const found = state.files !== null ? `Found ${state.files.toLocaleString('en-US')} files. ` : ''
      const notes = [
        `Opening ${at}.`,
        `${found}Counting the languages.`,
        'Counting the languages. Measuring the activity.',
        'Measured the activity. Checking the health.',
        'Checked the health. Putting the report together.',
      ]
      return notes[Math.min(state.stagesCompleted, notes.length - 1)]
    }
    case 'fallback':
      return `${at}: the progress stream did not answer. Loading the data the direct way.`
    case 'revealing':
      return 'Scan complete. Opening the report.'
    case 'error':
      return `${at}: ${state.error?.message ?? 'The scan could not finish.'}`
  }
}

/**
 * Sweep math. While waiting the line creeps forward but can never pass
 * the cap of the completed stages — with no data, the line can never
 * finish (caps all stay below 1). The reveal runs to the full width in
 * SCAN_REVEAL_MS once the data is on screen, easeOutQuad.
 */
export function sweepCreepTarget(elapsedMs: number, stagesCompleted: number): number {
  const elapsed = Math.max(0, elapsedMs)
  return Math.min(scanStageCap(stagesCompleted), SCAN_FLOW.creepStart + SCAN_FLOW.creepPerMs * elapsed)
}

export function sweepRevealFraction(elapsedMs: number, fromFrac: number): number {
  const t = Math.min(1, Math.max(0, elapsedMs) / SCAN_FLOW.revealMs)
  const eased = 1 - (1 - t) * (1 - t)
  return fromFrac + (1 - fromFrac) * eased
}

/**
 * The placeholder field shown before the real tree arrives: same shape
 * as the demo grid, least square glyphs, language null so nothing reads
 * as scanned data. The count is 240 (the reference grid) until the tree
 * stage corrects it.
 */
export function createPlaceholderScan(count: number, owner: string, repo: string): Scan {
  const dotCount = Math.max(0, Math.min(count, 2500))
  const files = Array.from({ length: dotCount }, (_unused, index) => ({
    path: `placeholder-${index}`,
    name: `placeholder-${index}`,
    size: 0,
    language: null,
    folder: '(root)',
  }))
  return {
    owner,
    name: repo,
    description: '',
    defaultBranch: '',
    stars: 0,
    htmlUrl: '',
    files,
    languages: [],
    activity: [],
    contributors: [],
    commits: 0,
    health: { score: 0, checks: [] },
    dependencies: [],
    flags: { truncated: false, statsPending: false },
    scannedAt: new Date(0).toISOString(),
  }
}
