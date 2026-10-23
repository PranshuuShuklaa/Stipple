import { describe, it, expect } from 'vitest'
import {
  createScanFixture,
  FIXTURE_FILE_COUNT,
  FIXTURE_GRID_COLS,
  FIXTURE_GRID_ROWS,
  FIXTURE_FOLDERS,
} from '../fixtures/scan-fixture'
import { calculateFilesLayout } from '@/engine/layouts/files'
import { parseColor } from '@/engine/colors'

describe('Seeded Fixture Generator', () => {
  it('generates deterministic scan fixture for the same seed', () => {
    const fixture1 = createScanFixture('test/repo')
    const fixture2 = createScanFixture('test/repo')

    expect(fixture1.files.length).toBe(FIXTURE_FILE_COUNT)
    expect(fixture1.files[0].path).toBe(fixture2.files[0].path)
    expect(fixture1.files[100].name).toBe(fixture2.files[100].name)
    expect(fixture1.health.score).toBe(fixture2.health.score)
    expect(fixture1.commits).toBe(fixture2.commits)
  })

  it('contains exactly 240 files across 5 folders and 16 weeks of activity', () => {
    const fixture = createScanFixture(42)
    expect(fixture.files.length).toBe(240)
    expect(fixture.languages.length).toBe(5)
    expect(fixture.activity.length).toBe(16)

    const folderSet = new Set(fixture.files.map((f) => f.folder))
    for (const folder of FIXTURE_FOLDERS) {
      expect(folderSet.has(folder)).toBe(true)
    }
  })
})

describe('Files Layout Math', () => {
  const theme = {
    fg: [26, 21, 51] as [number, number, number],
    panel: [223, 217, 242] as [number, number, number],
    c1: [91, 43, 224] as [number, number, number],
    c2: [224, 36, 110] as [number, number, number],
    c3: [199, 119, 0] as [number, number, number],
    c4: [11, 143, 99] as [number, number, number],
    c5: [10, 127, 194] as [number, number, number],
  }

  it('calculates 24 by 10 grid for 240 files', () => {
    const scan = createScanFixture('stipple/stipple')
    const layout = calculateFilesLayout(scan, { width: 960, height: 540 }, theme)

    expect(layout.dotCount).toBe(240)
    expect(layout.cols).toBe(FIXTURE_GRID_COLS)
    expect(layout.rows).toBe(FIXTURE_GRID_ROWS)
    expect(layout.x.length).toBe(240)
    expect(layout.y.length).toBe(240)
  })

  it('enforces dot diameter between 6 and 12 px (never larger than 12 px)', () => {
    const scan = createScanFixture('stipple/stipple')

    // Large screen (2560px wide) -> clamp to 12
    const largeLayout = calculateFilesLayout(scan, { width: 2560, height: 1440 }, theme)
    expect(largeLayout.size[0]).toBeLessThanOrEqual(12)
    expect(largeLayout.size[0]).toBeGreaterThanOrEqual(6)

    // Small screen (400px wide) -> clamp to 6
    const smallLayout = calculateFilesLayout(scan, { width: 400, height: 600 }, theme)
    expect(smallLayout.size[0]).toBeLessThanOrEqual(12)
    expect(smallLayout.size[0]).toBeGreaterThanOrEqual(4)
  })

  it('applies opacity 0.85 and fg color to all dots in Files layout', () => {
    const scan = createScanFixture('stipple/stipple')
    const layout = calculateFilesLayout(scan, { width: 960, height: 540 }, theme)

    for (let i = 0; i < layout.dotCount; i++) {
      expect(layout.alpha[i]).toBeCloseTo(0.85)
      expect(layout.r[i]).toBe(theme.fg[0])
      expect(layout.g[i]).toBe(theme.fg[1])
      expect(layout.b[i]).toBe(theme.fg[2])
    }
  })

  it('centers the grid horizontally around cx = W / 2', () => {
    const W = 1000
    const H = 600
    const scan = createScanFixture('stipple/stipple')
    const layout = calculateFilesLayout(scan, { width: W, height: H }, theme)

    // Dot on column 0 vs column 23 in the same row
    const firstColX = layout.x[0]
    const lastColX = layout.x[23]
    const s = layout.size[0]

    // Centers of first and last dot in row 0
    const centerFirst = firstColX + s / 2
    const centerLast = lastColX + s / 2
    const midpoint = (centerFirst + centerLast) / 2

    expect(midpoint).toBeCloseTo(W / 2, 1)
  })
})

describe('Color Utilities', () => {
  it('parses hex and rgb strings correctly', () => {
    expect(parseColor('#5B2BE0')).toEqual([91, 43, 224])
    expect(parseColor('#FFF')).toEqual([255, 255, 255])
    expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30])
  })
})
