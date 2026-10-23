import type { Scan } from '@/lib/types/scan'
import type { LayoutTarget, ThemeColors, Viewport } from './files'

/**
 * Calculates dot positions and properties for the Activity 16-week columns layout.
 * Conforms strictly to REFERENCE.md:
 * - 16 weekly columns
 * - P = min(W / 25, H / 13)
 * - Px = W * 0.8 / 16
 * - Pv = min(P, (H - 130) / maxWeekCount)
 * - x = cx + (week - 7.5) * Px - s / 2
 * - y = H - 70 - k * Pv - s / 2 (k is dot's index in week stack, growing upward)
 * - Color is c1 (theme.c1)
 * - Opacity is 0.2 + 0.8 * week / 15 (older is fainter)
 * - Diameter s = min(clamp(6, round(W / 90), 12), 0.8 * min(Px, Pv)), max 12 px
 */
export function calculateActivityLayout(
  scan: Scan,
  viewport: Viewport,
  theme: ThemeColors
): LayoutTarget {
  const n = scan.files.length
  const W = viewport.width
  const H = viewport.height

  const cx = W / 2
  const P = Math.min(W / 25, H / 13)
  const Px = (W * 0.8) / 16

  // Assign each dot to a week (0..15)
  const dotWeeks = new Int32Array(n)
  const weekCounts = new Int32Array(16)
  const dotWeekIndices = new Int32Array(n)

  // Check if files already have week assignments (e.g. from fixture or scan)
  let hasPresetWeeks = true
  for (let i = 0; i < n; i++) {
    const w = scan.files[i]?.week
    if (typeof w !== 'number' || w < 0 || w >= 16) {
      hasPresetWeeks = false
      break
    }
  }

  if (hasPresetWeeks) {
    for (let i = 0; i < n; i++) {
      const w = scan.files[i]!.week!
      dotWeeks[i] = w
      dotWeekIndices[i] = weekCounts[w]
      weekCounts[w]++
    }
  } else {
    // Apportion files across weeks proportional to scan.activity commits
    const totalCommits = scan.activity.reduce((sum, item) => sum + (item.commits || 0), 0)
    const targetCounts = new Int32Array(16)
    let assigned = 0

    for (let w = 0; w < 16; w++) {
      const commits = scan.activity[w]?.commits || 0
      const count = Math.round((commits / Math.max(1, totalCommits)) * n)
      targetCounts[w] = count
      assigned += count
    }

    // Adjust discrepancy to highest commit week
    let maxWeek = 15
    for (let w = 0; w < 16; w++) {
      if (targetCounts[w] > targetCounts[maxWeek]) {
        maxWeek = w
      }
    }
    targetCounts[maxWeek] += n - assigned

    let currentDot = 0
    for (let w = 0; w < 16; w++) {
      const count = targetCounts[w]
      for (let k = 0; k < count && currentDot < n; k++) {
        dotWeeks[currentDot] = w
        dotWeekIndices[currentDot] = k
        weekCounts[w]++
        currentDot++
      }
    }
    // Any remaining dots
    while (currentDot < n) {
      dotWeeks[currentDot] = 15
      dotWeekIndices[currentDot] = weekCounts[15]
      weekCounts[15]++
      currentDot++
    }
  }

  let maxWeekCount = 1
  for (let w = 0; w < 16; w++) {
    if (weekCounts[w] > maxWeekCount) {
      maxWeekCount = weekCounts[w]
    }
  }

  const Pv = Math.min(P, Math.max(2, (H - 130) / maxWeekCount))
  const baseS = Math.max(6, Math.min(12, Math.round(W / 90)))
  const s = Math.min(baseS, Math.max(4, 0.8 * Math.min(Px, Pv)))
  const halfS = s / 2

  const x = new Float32Array(n)
  const y = new Float32Array(n)
  const size = new Float32Array(n)
  const alpha = new Float32Array(n)
  const rArr = new Uint8ClampedArray(n)
  const gArr = new Uint8ClampedArray(n)
  const bArr = new Uint8ClampedArray(n)

  const [c1R, c1G, c1B] = theme.c1

  for (let i = 0; i < n; i++) {
    const w = dotWeeks[i]
    const k = dotWeekIndices[i]

    x[i] = cx + (w - 7.5) * Px - halfS
    y[i] = H - 70 - k * Pv - halfS
    size[i] = s
    alpha[i] = 0.2 + (0.8 * w) / 15
    rArr[i] = c1R
    gArr[i] = c1G
    bArr[i] = c1B
  }

  return {
    x,
    y,
    size,
    alpha,
    r: rArr,
    g: gArr,
    b: bArr,
    dotCount: n,
    cols: 16,
    rows: maxWeekCount,
  }
}
