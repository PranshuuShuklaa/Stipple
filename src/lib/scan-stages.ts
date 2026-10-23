/**
 * Shared scan-stage vocabulary for the progress stream and the scan
 * screen: the stages the sweep follows (DESIGN.md "tree, languages,
 * activity, health"), the timing constants and the line-position caps.
 * Importable from both server and client code (no side effects).
 */

export const SCAN_STAGES = ['tree', 'languages', 'activity', 'health'] as const

export type ScanStageName = (typeof SCAN_STAGES)[number]

export const SCAN_STAGE_TOTAL = SCAN_STAGES.length

/** Stage ordinal, 1-based, matching the event payload's `index`. */
export function scanStageIndexOf(stage: ScanStageName): number {
  return SCAN_STAGES.indexOf(stage) + 1
}

export interface ScanStageEvent {
  stage: ScanStageName
  index: number
  total: number
  /** Real file count, sent only by the tree stage. */
  files?: number
}

/** Stage events arrive at most this long after the stream opens. */
export const SCAN_FALLBACK_AFTER_MS = 4000

/** The screen never stays stuck longer than this before the error state. */
export const SCAN_MAX_WAIT_MS = 15000

/** A cached scan's color reveal finishes in about this long. */
export const SCAN_REVEAL_MS = 900

/**
 * How far the sweep line may travel once a stage completes, by the number
 * of completed stages (0 = none yet). Caps always leave the last reach to
 * the color reveal after the data arrives.
 */
export const SCAN_LINE_CAPS = [0.06, 0.3, 0.52, 0.72, 0.85] as const

export function scanStageCap(stagesCompleted: number): number {
  const index = Math.min(Math.max(stagesCompleted, 0), SCAN_LINE_CAPS.length - 1)
  return SCAN_LINE_CAPS[index]
}
