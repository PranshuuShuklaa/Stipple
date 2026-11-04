import type { Scan, ScanPulseDay } from '@/lib/types/scan'
import type { LayoutTarget, ThemeColors, Viewport } from './files'

export const PULSE_COLS = 52
export const PULSE_ROWS = 7
export const PULSE_TOTAL_DAYS = PULSE_COLS * PULSE_ROWS // 364

export interface PulseLayoutTarget extends LayoutTarget {
  lastCommitIndex: number
  lastCommitRing: {
    cx: number
    cy: number
    radius: number
  } | null
  cell: number
  startX: number
  startY: number
}

export interface PulseMonthLabel {
  text: string
  x: number
  y: number
  weekIndex: number
}

export interface PulseWeekdayLabel {
  text: string
  x: number
  y: number
  dayIndex: number
}

export interface PulseLabelsData {
  months: PulseMonthLabel[]
  weekdays: PulseWeekdayLabel[]
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/**
 * Returns commit level styling factors conforming strictly to FEATURES-SPEC.md:
 * - 0 commits: size 0.45 of cell, alpha 0.15
 * - 1 to 2 commits: size 0.60 of cell, alpha 0.45
 * - 3 to 5 commits: size 0.80 of cell, alpha 0.65
 * - 6 to 10 commits: size 0.90 of cell, alpha 0.85
 * - 11 or more commits: size 1.00 of cell, alpha 1.00
 */
export function getPulseLevel(commits: number): { sizeFactor: number; alpha: number } {
  if (commits <= 0) {
    return { sizeFactor: 0.45, alpha: 0.15 }
  }
  if (commits <= 2) {
    return { sizeFactor: 0.6, alpha: 0.45 }
  }
  if (commits <= 5) {
    return { sizeFactor: 0.8, alpha: 0.65 }
  }
  if (commits <= 10) {
    return { sizeFactor: 0.9, alpha: 0.85 }
  }
  return { sizeFactor: 1.0, alpha: 1.0 }
}

/**
 * Normalizes pulse days to exactly 364 entries (52 weeks × 7 days).
 * Repos with fewer than 52 weeks of history are padded at the beginning
 * with 0-commit faint dots so the calendar always shows 52 columns.
 */
export function normalizePulseDays(scan: Scan): ScanPulseDay[] {
  const rawDays = scan.pulse?.days ?? []
  if (rawDays.length === PULSE_TOTAL_DAYS) {
    return rawDays
  }

  if (rawDays.length > PULSE_TOTAL_DAYS) {
    return rawDays.slice(rawDays.length - PULSE_TOTAL_DAYS)
  }

  // Fewer than 364 days: pad at the start
  const missing = PULSE_TOTAL_DAYS - rawDays.length
  const padded: ScanPulseDay[] = new Array(PULSE_TOTAL_DAYS)
  for (let i = 0; i < missing; i++) {
    padded[i] = { date: '', commits: 0 }
  }
  for (let i = 0; i < rawDays.length; i++) {
    padded[missing + i] = rawDays[i]!
  }
  return padded
}

/**
 * Pure function: calculates dot positions and properties for the Pulse 52×7 calendar layout.
 * Conforms to FEATURES-SPEC.md:
 * - 52 columns by 7 rows (Sunday to Saturday)
 * - Levels by commit count (size and alpha)
 * - Accent color (theme.c1 / top language color)
 * - Ring for the last commit day
 * - Unused pool dots wait at stage center with alpha 0
 */
export function calculatePulseLayout(
  scan: Scan,
  viewport: Viewport,
  theme: ThemeColors,
  poolSize?: number
): PulseLayoutTarget {
  const W = Math.max(10, viewport.width)
  const H = Math.max(10, viewport.height)
  const days = normalizePulseDays(scan)
  const activeCount = PULSE_TOTAL_DAYS
  const total = poolSize !== undefined ? Math.max(activeCount, poolSize) : activeCount

  // Reserve margins: left for weekday labels, top for month labels
  const availW = Math.max(10, W - 64)
  const availH = Math.max(10, H - 56)
  const rawCell = Math.min(availW / PULSE_COLS, availH / PULSE_ROWS)
  // Max cell size 14 ensures dot diameter never exceeds 12 px (14 * 0.85 approx 12)
  const cell = Math.max(2, Math.min(14, rawCell))

  // Center grid with a small offset for left/top labels
  const gridW = PULSE_COLS * cell
  const gridH = PULSE_ROWS * cell
  const startX = Math.round((W - gridW) / 2 + 12)
  const startY = Math.round((H - gridH) / 2 + 10)

  const x = new Float32Array(total)
  const y = new Float32Array(total)
  const size = new Float32Array(total)
  const alpha = new Float32Array(total)
  const r = new Uint8ClampedArray(total)
  const g = new Uint8ClampedArray(total)
  const b = new Uint8ClampedArray(total)

  // Accent color is top language color (theme.c1)
  const [cr, cg, cb] = theme.c1

  // Determine last commit index for the ring
  let lastCommitIndex = -1
  const targetDate = scan.pulse?.lastCommit
  if (targetDate) {
    for (let i = activeCount - 1; i >= 0; i--) {
      if (days[i]?.date === targetDate) {
        lastCommitIndex = i
        break
      }
    }
  }
  // Fallback: find the latest day with commits > 0
  if (lastCommitIndex === -1) {
    for (let i = activeCount - 1; i >= 0; i--) {
      if ((days[i]?.commits ?? 0) > 0) {
        lastCommitIndex = i
        break
      }
    }
  }

  for (let i = 0; i < activeCount; i++) {
    const col = Math.floor(i / PULSE_ROWS)
    const row = i % PULSE_ROWS
    const commits = days[i]?.commits ?? 0
    const { sizeFactor, alpha: dotAlpha } = getPulseLevel(commits)

    // Base dot diameter, clamped between 2 and 12 px (AGENTS.md line 27)
    const s = Math.min(12, Math.max(2, cell * sizeFactor))
    const halfS = s / 2

    const cx = startX + col * cell + cell / 2
    const cy = startY + row * cell + cell / 2

    x[i] = cx - halfS
    y[i] = cy - halfS
    size[i] = s
    alpha[i] = dotAlpha
    r[i] = cr
    g[i] = cg
    b[i] = cb
  }

  // Unused pool dots wait at the stage center with alpha 0
  const centerCx = W / 2
  const centerCy = H / 2 - 8
  const baseS = Math.max(4, Math.min(12, Math.round(W / 90)))
  const halfBaseS = baseS / 2
  for (let i = activeCount; i < total; i++) {
    x[i] = centerCx - halfBaseS
    y[i] = centerCy - halfBaseS
    size[i] = baseS
    alpha[i] = 0
    r[i] = cr
    g[i] = cg
    b[i] = cb
  }

  let lastCommitRing: PulseLayoutTarget['lastCommitRing'] = null
  if (lastCommitIndex >= 0 && lastCommitIndex < activeCount) {
    const dotS = size[lastCommitIndex]!
    const dotX = x[lastCommitIndex]! + dotS / 2
    const dotY = y[lastCommitIndex]! + dotS / 2
    lastCommitRing = {
      cx: dotX,
      cy: dotY,
      radius: Math.max(dotS / 2 + 3, cell * 0.6),
    }
  }

  return {
    x,
    y,
    size,
    alpha,
    r,
    g,
    b,
    dotCount: total,
    cols: PULSE_COLS,
    rows: PULSE_ROWS,
    lastCommitIndex,
    lastCommitRing,
    cell,
    startX,
    startY,
  }
}

/**
 * Pure function: computes month label and weekday label positions and text
 * for the UI to draw above and beside the 52×7 calendar.
 */
export function getPulseLabelsData(
  scan: Scan,
  viewport: Viewport,
  layout?: PulseLayoutTarget
): PulseLabelsData {
  const target = layout ?? calculatePulseLayout(scan, viewport, {
    fg: [26, 21, 51],
    dim: [81, 73, 111],
    panel: [223, 217, 242],
    c1: [91, 43, 224],
    c2: [224, 36, 110],
    c3: [199, 119, 0],
    c4: [11, 143, 99],
    c5: [10, 127, 194],
  })

  const { cell, startX, startY } = target
  const days = normalizePulseDays(scan)

  // Weekday labels: Mon (row 1), Wed (row 3), Fri (row 5) on the left
  const weekdays: PulseWeekdayLabel[] = [
    {
      text: 'Mon',
      dayIndex: 1,
      x: startX - 10,
      y: startY + 1 * cell + cell / 2,
    },
    {
      text: 'Wed',
      dayIndex: 3,
      x: startX - 10,
      y: startY + 3 * cell + cell / 2,
    },
    {
      text: 'Fri',
      dayIndex: 5,
      x: startX - 10,
      y: startY + 5 * cell + cell / 2,
    },
  ]

  // Month labels: placed above the first week of each month
  const months: PulseMonthLabel[] = []
  let lastLabeledCol = -4
  let lastMonth = -1

  for (let col = 0; col < PULSE_COLS; col++) {
    // Check first day of week
    const day = days[col * PULSE_ROWS]
    let monthIdx = -1
    if (day?.date && day.date.length >= 7) {
      const m = parseInt(day.date.slice(5, 7), 10)
      if (m >= 1 && m <= 12) {
        monthIdx = m - 1
      }
    }

    // If date is missing/empty, synthesize month progression based on 52 weeks
    if (monthIdx === -1) {
      monthIdx = Math.floor((col / PULSE_COLS) * 12) % 12
    }

    if (monthIdx !== lastMonth && col - lastLabeledCol >= 3) {
      months.push({
        text: MONTH_NAMES[monthIdx] ?? 'Jan',
        x: startX + col * cell + cell / 2,
        y: startY - 10,
        weekIndex: col,
      })
      lastMonth = monthIdx
      lastLabeledCol = col
    }
  }

  return { months, weekdays }
}
