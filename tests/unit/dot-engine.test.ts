import { describe, it, expect } from 'vitest'
import {
  createScanFixture,
  FIXTURE_FILE_COUNT,
  FIXTURE_GRID_COLS,
  FIXTURE_GRID_ROWS,
  FIXTURE_FOLDERS,
} from '../fixtures/scan-fixture'
import { calculateFilesLayout } from '@/engine/layouts/files'
import { calculateLanguagesLayout } from '@/engine/layouts/languages'
import { calculateActivityLayout } from '@/engine/layouts/activity'
import { calculateFoldersLayout, FOLDER_CENTERS } from '@/engine/layouts/folders'
import { SpatialGrid } from '@/engine/spatial-grid'
import { parseColor } from '@/engine/colors'
import { pickMorphOrigin, type MorphOptions } from '@/engine/renderer'

const theme = {
  fg: [26, 21, 51] as [number, number, number],
  panel: [223, 217, 242] as [number, number, number],
  c1: [91, 43, 224] as [number, number, number],
  c2: [224, 36, 110] as [number, number, number],
  c3: [199, 119, 0] as [number, number, number],
  c4: [11, 143, 99] as [number, number, number],
  c5: [10, 127, 194] as [number, number, number],
}

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

    const largeLayout = calculateFilesLayout(scan, { width: 2560, height: 1440 }, theme)
    expect(largeLayout.size[0]).toBeLessThanOrEqual(12)
    expect(largeLayout.size[0]).toBeGreaterThanOrEqual(6)

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

  it('has valid coordinates with no NaN and within bounds', () => {
    const W = 1000
    const H = 600
    const scan = createScanFixture('stipple/stipple')
    const layout = calculateFilesLayout(scan, { width: W, height: H }, theme)

    for (let i = 0; i < layout.dotCount; i++) {
      expect(Number.isFinite(layout.x[i])).toBe(true)
      expect(Number.isFinite(layout.y[i])).toBe(true)
      expect(Number.isFinite(layout.size[i])).toBe(true)
      expect(Number.isFinite(layout.alpha[i])).toBe(true)
      expect(layout.x[i]).toBeGreaterThanOrEqual(0)
      expect(layout.x[i]).toBeLessThanOrEqual(W)
      expect(layout.y[i]).toBeGreaterThanOrEqual(0)
      expect(layout.y[i]).toBeLessThanOrEqual(H)
    }
  })
})

describe('Languages Layout Math', () => {
  it('calculates stacked bar with 12 rows per column for 240 files', () => {
    const scan = createScanFixture('stipple/stipple')
    const layout = calculateLanguagesLayout(scan, { width: 960, height: 540 }, theme)

    expect(layout.dotCount).toBe(240)
    expect(layout.rows).toBe(12)
    expect(layout.cols).toBeGreaterThanOrEqual(20)
    expect(layout.x.length).toBe(240)
    expect(layout.y.length).toBe(240)
  })

  it('contains no NaN and stays within viewport bounds', () => {
    const W = 960
    const H = 540
    const scan = createScanFixture('stipple/stipple')
    const layout = calculateLanguagesLayout(scan, { width: W, height: H }, theme)

    for (let i = 0; i < layout.dotCount; i++) {
      expect(Number.isFinite(layout.x[i])).toBe(true)
      expect(Number.isFinite(layout.y[i])).toBe(true)
      expect(Number.isFinite(layout.size[i])).toBe(true)
      expect(Number.isFinite(layout.alpha[i])).toBe(true)
      expect(layout.x[i]).toBeGreaterThan(0)
      expect(layout.x[i]).toBeLessThan(W)
      expect(layout.y[i]).toBeGreaterThan(0)
      expect(layout.y[i]).toBeLessThan(H)
      expect(layout.size[i]).toBeLessThanOrEqual(12)
      expect(layout.size[i]).toBeGreaterThanOrEqual(4)
      expect(layout.alpha[i]).toBe(1.0)
    }
  })

  it('assigns correct language theme colors and full opacity', () => {
    const scan = createScanFixture('stipple/stipple')
    const layout = calculateLanguagesLayout(scan, { width: 960, height: 540 }, theme)

    const allowedColors = [theme.c1, theme.c2, theme.c3, theme.c4, theme.c5]
    for (let i = 0; i < layout.dotCount; i++) {
      const match = allowedColors.some(
        ([cr, cg, cb]) => layout.r[i] === cr && layout.g[i] === cg && layout.b[i] === cb
      )
      expect(match).toBe(true)
    }
  })
})

describe('Activity Layout Math', () => {
  it('calculates 16 weekly columns and aligns dots in stacks', () => {
    const scan = createScanFixture('stipple/stipple')
    const layout = calculateActivityLayout(scan, { width: 960, height: 540 }, theme)

    expect(layout.dotCount).toBe(240)
    expect(layout.cols).toBe(16)
    expect(layout.rows).toBeGreaterThanOrEqual(1)
  })

  it('contains no NaN, enforces bounds and never exceeds 12px size', () => {
    const W = 960
    const H = 540
    const scan = createScanFixture('stipple/stipple')
    const layout = calculateActivityLayout(scan, { width: W, height: H }, theme)

    for (let i = 0; i < layout.dotCount; i++) {
      expect(Number.isFinite(layout.x[i])).toBe(true)
      expect(Number.isFinite(layout.y[i])).toBe(true)
      expect(Number.isFinite(layout.size[i])).toBe(true)
      expect(Number.isFinite(layout.alpha[i])).toBe(true)
      expect(layout.x[i]).toBeGreaterThan(0)
      expect(layout.x[i]).toBeLessThan(W)
      expect(layout.y[i]).toBeGreaterThan(0)
      expect(layout.y[i]).toBeLessThan(H)
      expect(layout.size[i]).toBeLessThanOrEqual(12)
      expect(layout.size[i]).toBeGreaterThanOrEqual(4)
      // Opacity between 0.2 and 1.0
      expect(layout.alpha[i]).toBeGreaterThanOrEqual(0.2)
      expect(layout.alpha[i]).toBeLessThanOrEqual(1.0)
      // Color is c1
      expect(layout.r[i]).toBe(theme.c1[0])
      expect(layout.g[i]).toBe(theme.c1[1])
      expect(layout.b[i]).toBe(theme.c1[2])
    }
  })
})

describe('Folders Layout Math', () => {
  it('calculates 5 spiral clusters with 5 corresponding labels', () => {
    const scan = createScanFixture('stipple/stipple')
    const layout = calculateFoldersLayout(scan, { width: 960, height: 540 }, theme)

    expect(layout.dotCount).toBe(240)
    expect(layout.labels.length).toBe(5)
    expect(FOLDER_CENTERS.length).toBe(5)

    const labelSum = layout.labels.reduce((acc, curr) => acc + curr.count, 0)
    expect(labelSum).toBe(240)
  })

  it('contains no NaN, valid spiral positions and valid label coordinates', () => {
    const W = 960
    const H = 540
    const scan = createScanFixture('stipple/stipple')
    const layout = calculateFoldersLayout(scan, { width: W, height: H }, theme)

    for (let i = 0; i < layout.dotCount; i++) {
      expect(Number.isFinite(layout.x[i])).toBe(true)
      expect(Number.isFinite(layout.y[i])).toBe(true)
      expect(Number.isFinite(layout.size[i])).toBe(true)
      expect(Number.isFinite(layout.alpha[i])).toBe(true)
      expect(layout.x[i]).toBeGreaterThan(0)
      expect(layout.x[i]).toBeLessThan(W)
      expect(layout.y[i]).toBeGreaterThan(0)
      expect(layout.y[i]).toBeLessThan(H)
      expect(layout.size[i]).toBeLessThanOrEqual(12)
      expect(layout.alpha[i]).toBe(1.0)
    }

    for (const label of layout.labels) {
      expect(Number.isFinite(label.x)).toBe(true)
      expect(Number.isFinite(label.y)).toBe(true)
      expect(label.x).toBeGreaterThan(0)
      expect(label.x).toBeLessThan(W)
      expect(label.y).toBeGreaterThan(0)
      expect(label.y).toBeLessThan(H)
      expect(label.folder.length).toBeGreaterThan(0)
      expect(label.count).toBeGreaterThan(0)
    }
  })
})

describe('Spatial Grid Search', () => {
  it('finds the nearest dot in O(1) within hit radius', () => {
    const grid = new SpatialGrid(40)
    const n = 5
    const x = new Float32Array([100, 200, 300, 400, 500])
    const y = new Float32Array([100, 100, 100, 100, 100])
    const size = new Float32Array([10, 10, 10, 10, 10])

    grid.build(x, y, size, n, 800, 600)

    // Query close to dot index 2 (center 305, 105)
    const result = grid.findNearest(308, 106, 20)
    expect(result).not.toBeNull()
    expect(result?.index).toBe(2)
    expect(result?.distance).toBeCloseTo(3.16, 1)

    // Query far away from any dot
    const farResult = grid.findNearest(300, 400, 20)
    expect(farResult).toBeNull()
  })

  it('handles boundaries and empty queries gracefully', () => {
    const grid = new SpatialGrid(40)
    expect(grid.findNearest(100, 100, 20)).toBeNull()

    const x = new Float32Array([0, 790])
    const y = new Float32Array([0, 590])
    const size = new Float32Array([10, 10])

    grid.build(x, y, size, 2, 800, 600)
    const edge1 = grid.findNearest(5, 5, 20)
    expect(edge1?.index).toBe(0)

    const edge2 = grid.findNearest(795, 595, 20)
    expect(edge2?.index).toBe(1)
  })
})

describe('Color Utilities', () => {
  it('parses hex and rgb strings correctly', () => {
    expect(parseColor('#5B2BE0')).toEqual([91, 43, 224])
    expect(parseColor('#FFF')).toEqual([255, 255, 255])
    expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30])
  })
})

describe('pickMorphOrigin', () => {
  it('an explicit options.origin always wins', () => {
    expect(pickMorphOrigin('first', [50, 60])).toBe('first')
    expect(pickMorphOrigin([10, 20], [50, 60])).toEqual([10, 20])
  })

  it('falls back to the last click point (canvas-local [x, y])', () => {
    expect(pickMorphOrigin(undefined, [50, 60])).toEqual([50, 60])
  })

  it('defaults to the center without a click', () => {
    expect(pickMorphOrigin(undefined, null)).toBe('center')
  })

  it('uses plain origin unions as-is', () => {
    const opts: MorphOptions['origin'] = 'last'
    expect(pickMorphOrigin(opts, null)).toBe('last')
  })
})
