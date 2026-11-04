import { describe, it, expect } from 'vitest'
import {
  calculatePulseLayout,
  getPulseLevel,
  getPulseLabelsData,
  normalizePulseDays,
  PULSE_COLS,
  PULSE_ROWS,
  PULSE_TOTAL_DAYS,
} from '@/engine/layouts/pulse'
import { calculateFilesLayout } from '@/engine/layouts/files'
import { createScanFixture } from '../fixtures/scan-fixture'
import type { Scan } from '@/lib/types/scan'

const theme = {
  fg: [26, 21, 51] as [number, number, number],
  panel: [223, 217, 242] as [number, number, number],
  dim: [81, 73, 111] as [number, number, number],
  c1: [91, 43, 224] as [number, number, number],
  c2: [224, 36, 110] as [number, number, number],
  c3: [199, 119, 0] as [number, number, number],
  c4: [11, 143, 99] as [number, number, number],
  c5: [10, 127, 194] as [number, number, number],
}

describe('Pulse commit level boundaries (FEATURES-SPEC.md)', () => {
  it('maps 0 commits to sizeFactor 0.45 and alpha 0.15', () => {
    const level = getPulseLevel(0)
    expect(level.sizeFactor).toBeCloseTo(0.45)
    expect(level.alpha).toBeCloseTo(0.15)
  })

  it('maps negative commits to 0-level defaults', () => {
    const level = getPulseLevel(-5)
    expect(level.sizeFactor).toBeCloseTo(0.45)
    expect(level.alpha).toBeCloseTo(0.15)
  })

  it('maps 1 to 2 commits to sizeFactor 0.60 and alpha 0.45', () => {
    const level1 = getPulseLevel(1)
    expect(level1.sizeFactor).toBeCloseTo(0.6)
    expect(level1.alpha).toBeCloseTo(0.45)

    const level2 = getPulseLevel(2)
    expect(level2.sizeFactor).toBeCloseTo(0.6)
    expect(level2.alpha).toBeCloseTo(0.45)
  })

  it('maps 3 to 5 commits to sizeFactor 0.80 and alpha 0.65', () => {
    const level3 = getPulseLevel(3)
    expect(level3.sizeFactor).toBeCloseTo(0.8)
    expect(level3.alpha).toBeCloseTo(0.65)

    const level4 = getPulseLevel(4)
    expect(level4.sizeFactor).toBeCloseTo(0.8)
    expect(level4.alpha).toBeCloseTo(0.65)

    const level5 = getPulseLevel(5)
    expect(level5.sizeFactor).toBeCloseTo(0.8)
    expect(level5.alpha).toBeCloseTo(0.65)
  })

  it('maps 6 to 10 commits to sizeFactor 0.90 and alpha 0.85', () => {
    const level6 = getPulseLevel(6)
    expect(level6.sizeFactor).toBeCloseTo(0.9)
    expect(level6.alpha).toBeCloseTo(0.85)

    const level10 = getPulseLevel(10)
    expect(level10.sizeFactor).toBeCloseTo(0.9)
    expect(level10.alpha).toBeCloseTo(0.85)
  })

  it('maps 11 or more commits to sizeFactor 1.00 and alpha 1.00', () => {
    const level11 = getPulseLevel(11)
    expect(level11.sizeFactor).toBeCloseTo(1.0)
    expect(level11.alpha).toBeCloseTo(1.0)

    const level100 = getPulseLevel(100)
    expect(level100.sizeFactor).toBeCloseTo(1.0)
    expect(level100.alpha).toBeCloseTo(1.0)
  })
})

describe('Pulse Layout Math (52 cols x 7 rows)', () => {
  it('calculates exactly 364 day dots for 52 columns and 7 rows', () => {
    const scan = createScanFixture('stipple/stipple')
    const layout = calculatePulseLayout(scan, { width: 960, height: 540 }, theme)

    expect(layout.cols).toBe(PULSE_COLS)
    expect(layout.rows).toBe(PULSE_ROWS)
    expect(layout.dotCount).toBe(PULSE_TOTAL_DAYS)
    expect(layout.x.length).toBe(PULSE_TOTAL_DAYS)
    expect(layout.y.length).toBe(PULSE_TOTAL_DAYS)
    expect(layout.size.length).toBe(PULSE_TOTAL_DAYS)
    expect(layout.alpha.length).toBe(PULSE_TOTAL_DAYS)
  })

  it('produces bounded coordinates with no NaN or Infinity', () => {
    const scan = createScanFixture('stipple/stipple')
    const layout = calculatePulseLayout(scan, { width: 960, height: 540 }, theme)

    for (let i = 0; i < layout.dotCount; i++) {
      expect(Number.isFinite(layout.x[i])).toBe(true)
      expect(Number.isFinite(layout.y[i])).toBe(true)
      expect(Number.isFinite(layout.size[i])).toBe(true)
      expect(Number.isFinite(layout.alpha[i])).toBe(true)
      expect(Number.isNaN(layout.x[i])).toBe(false)
      expect(Number.isNaN(layout.y[i])).toBe(false)

      // Clamped dot diameter: never larger than 12 px (AGENTS.md line 27)
      expect(layout.size[i]).toBeLessThanOrEqual(12)
      expect(layout.size[i]).toBeGreaterThanOrEqual(2)

      // Within stage bounds
      expect(layout.x[i]!).toBeGreaterThanOrEqual(0)
      expect(layout.x[i]!).toBeLessThanOrEqual(960)
      expect(layout.y[i]!).toBeGreaterThanOrEqual(0)
      expect(layout.y[i]!).toBeLessThanOrEqual(540)
    }
  })

  it('uses the accent color (theme.c1) for all pulse dots', () => {
    const scan = createScanFixture('stipple/stipple')
    const layout = calculatePulseLayout(scan, { width: 960, height: 540 }, theme)

    for (let i = 0; i < layout.dotCount; i++) {
      expect(layout.r[i]).toBe(theme.c1[0])
      expect(layout.g[i]).toBe(theme.c1[1])
      expect(layout.b[i]).toBe(theme.c1[2])
    }
  })

  it('pads history before the first commit for repos with fewer than 52 weeks', () => {
    const scan = createScanFixture('stipple/stipple')
    // Provide only 14 days of history
    const shortDays = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-10-${String(i + 1).padStart(2, '0')}`,
      commits: 5,
    }))
    const shortScan: Scan = {
      ...scan,
      pulse: {
        days: shortDays,
        lastCommit: '2026-10-14',
        activeWeeks: 2,
        longestStreakWeeks: 2,
        busiestWeekday: 1,
        totalCommits: 70,
        topWeeksShare: 1,
        status: 'active',
        pattern: 'bursty',
      },
    }

    const normalized = normalizePulseDays(shortScan)
    expect(normalized).toHaveLength(PULSE_TOTAL_DAYS)
    // First 350 days are 0-commit padding
    expect(normalized[0]!.commits).toBe(0)
    expect(normalized[349]!.commits).toBe(0)
    // Last 14 days are the active days
    expect(normalized[350]!.commits).toBe(5)
    expect(normalized[363]!.commits).toBe(5)

    const layout = calculatePulseLayout(shortScan, { width: 960, height: 540 }, theme)
    expect(layout.dotCount).toBe(PULSE_TOTAL_DAYS)
    // Faint dots for padded weeks
    expect(layout.alpha[0]).toBeCloseTo(0.15)
    // Active dots for the last 2 weeks
    expect(layout.alpha[350]).toBeCloseTo(0.65)
  })

  it('identifies the last commit day and generates ring geometry', () => {
    const scan = createScanFixture('stipple/stipple')
    const days = Array.from({ length: 364 }, (_, i) => ({
      date: `2026-01-01`,
      commits: i === 200 ? 8 : 0,
    }))
    days[200]!.date = '2026-07-20'

    const pulseScan: Scan = {
      ...scan,
      pulse: {
        days,
        lastCommit: '2026-07-20',
        activeWeeks: 1,
        longestStreakWeeks: 1,
        busiestWeekday: 1,
        totalCommits: 8,
        topWeeksShare: 1,
        status: 'quiet',
        pattern: 'bursty',
      },
    }

    const layout = calculatePulseLayout(pulseScan, { width: 960, height: 540 }, theme)
    expect(layout.lastCommitIndex).toBe(200)
    expect(layout.lastCommitRing).not.toBeNull()
    expect(layout.lastCommitRing?.cx).toBeCloseTo(layout.x[200]! + layout.size[200]! / 2)
    expect(layout.lastCommitRing?.cy).toBeCloseTo(layout.y[200]! + layout.size[200]! / 2)
    expect(layout.lastCommitRing?.radius).toBeGreaterThan(layout.size[200]! / 2)
  })
})

describe('Dot Pool in Pulse & Files layout', () => {
  it('pads Pulse layout to poolSize with unused dots at stage center', () => {
    const scan = createScanFixture('big-repo')
    const layout = calculatePulseLayout(scan, { width: 960, height: 540 }, theme, 500)

    expect(layout.dotCount).toBe(500)
    expect(layout.x.length).toBe(500)

    const cx = 960 / 2
    const cy = 540 / 2 - 8

    // Active dots 0..363 have alpha > 0
    for (let i = 0; i < 364; i++) {
      expect(layout.alpha[i]).toBeGreaterThan(0)
    }

    // Unused dots 364..499 wait at center with alpha 0
    for (let i = 364; i < 500; i++) {
      expect(layout.alpha[i]).toBe(0)
      const halfS = layout.size[i]! / 2
      expect(layout.x[i]).toBeCloseTo(cx - halfS)
      expect(layout.y[i]).toBeCloseTo(cy - halfS)
    }
  })

  it('pads Files layout to poolSize (364) with unused dots at stage center', () => {
    const scan = createScanFixture('stipple/stipple') // 240 files
    const layout = calculateFilesLayout(scan, { width: 960, height: 540 }, theme, 364)

    expect(layout.dotCount).toBe(364)

    // Active files 0..239 have alpha 0.85
    for (let i = 0; i < 240; i++) {
      expect(layout.alpha[i]).toBeCloseTo(0.85)
    }

    const cx = 960 / 2
    const cy = 540 / 2 - 8

    // Unused dots 240..363 wait at center with alpha 0
    for (let i = 240; i < 364; i++) {
      expect(layout.alpha[i]).toBe(0)
      const halfS = layout.size[i]! / 2
      expect(layout.x[i]).toBeCloseTo(cx - halfS)
      expect(layout.y[i]).toBeCloseTo(cy - halfS)
    }
  })
})

describe('Pulse label data generator', () => {
  it('generates weekday labels for Mon, Wed, Fri and month labels', () => {
    const scan = createScanFixture('stipple/stipple')
    const labels = getPulseLabelsData(scan, { width: 960, height: 540 })

    expect(labels.weekdays).toHaveLength(3)
    expect(labels.weekdays.map((w) => w.text)).toEqual(['Mon', 'Wed', 'Fri'])
    for (const w of labels.weekdays) {
      expect(Number.isFinite(w.x)).toBe(true)
      expect(Number.isFinite(w.y)).toBe(true)
    }

    expect(labels.months.length).toBeGreaterThanOrEqual(6)
    for (const m of labels.months) {
      expect(typeof m.text).toBe('string')
      expect(Number.isFinite(m.x)).toBe(true)
      expect(Number.isFinite(m.y)).toBe(true)
      expect(m.weekIndex).toBeGreaterThanOrEqual(0)
      expect(m.weekIndex).toBeLessThan(52)
    }
  })
})

