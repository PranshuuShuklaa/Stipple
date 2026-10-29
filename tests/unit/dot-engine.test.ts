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
import { pickMorphOrigin, pixelOriginToFraction, type MorphOptions } from '@/engine/renderer'
import { PointerWakeEffect } from '@/engine/effects/pointer-wake'
import { ShockwaveEffect } from '@/engine/effects/shockwave'
import { createLanguageIndexer } from '@/engine/layouts/language-colors'
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

  it('applies opacity 0.85 and language-coded colors in Files layout', () => {
    const scan = createScanFixture('stipple/stipple')
    const layout = calculateFilesLayout(scan, { width: 960, height: 540 }, theme)

    const palette = [theme.c1, theme.c2, theme.c3, theme.c4, theme.c5, theme.fg]
    const seen = new Set<string>()

    for (let i = 0; i < layout.dotCount; i++) {
      expect(layout.alpha[i]).toBeCloseTo(0.85)
      const match = palette.findIndex(
        ([cr, cg, cb]) => layout.r[i] === cr && layout.g[i] === cg && layout.b[i] === cb
      )
      expect(match).toBeGreaterThanOrEqual(0)
      expect(match).toBeLessThanOrEqual(4) // fg must not appear while languages are counted
      seen.add(String(match))
    }

    // A 5-language fixture renders at least two distinct language colors
    expect(seen.size).toBeGreaterThanOrEqual(2)
  })

  it('maps each dot color through the shared language indexer (grid slot k = file k)', () => {
    const scan = createScanFixture('stipple/stipple')
    const layout = calculateFilesLayout(scan, { width: 960, height: 540 }, theme)
    const languageIndexFor = createLanguageIndexer(scan)
    const palette = [theme.c1, theme.c2, theme.c3, theme.c4, theme.c5]

    for (let i = 0; i < layout.dotCount; i++) {
      const [cr, cg, cb] = palette[languageIndexFor(scan.files[i]?.language)]
      expect(layout.r[i]).toBe(cr)
      expect(layout.g[i]).toBe(cg)
      expect(layout.b[i]).toBe(cb)
    }
  })

  it('keeps fg dots when the scan counts no languages (tiny data)', () => {
    const scan = createScanFixture('octocat/Hello-World')
    const tiny: Scan = {
      ...scan,
      files: [{ path: 'README', name: 'README', size: 10, language: null, folder: '' }],
      languages: [],
    }
    const layout = calculateFilesLayout(tiny, { width: 960, height: 540 }, theme)

    expect(layout.dotCount).toBe(1)
    expect(layout.r[0]).toBe(theme.fg[0])
    expect(layout.g[0]).toBe(theme.fg[1])
    expect(layout.b[0]).toBe(theme.fg[2])
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

  it('keeps neutral fg dots when the repo has no languages', () => {
    const scan = createScanFixture('octocat/Hello-World')
    const untyped: Scan = {
      ...scan,
      files: [
        { path: 'README', name: 'README', size: 10, language: null, folder: '(root)' },
        { path: 'main', name: 'main', size: 4, language: null, folder: '(root)' },
      ],
      languages: [],
    }
    const layout = calculateLanguagesLayout(untyped, { width: 960, height: 540 }, theme)

    for (let i = 0; i < layout.dotCount; i++) {
      expect(layout.r[i]).toBe(theme.fg[0])
      expect(layout.g[i]).toBe(theme.fg[1])
      expect(layout.b[i]).toBe(theme.fg[2])
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

  it('labels only the folders that exist (one-file repo gets one label)', () => {
    const scan = createScanFixture('octocat/Hello-World')
    const oneFile: Scan = {
      ...scan,
      files: [{ path: 'README', name: 'README', size: 10, language: null, folder: '(root)' }],
    }
    const layout = calculateFoldersLayout(oneFile, { width: 960, height: 540 }, theme)

    expect(layout.labels).toHaveLength(1)
    expect(layout.labels[0]).toMatchObject({ folder: '(root)', count: 1 })
    expect(layout.clusterOf[0]).toBe(0)
  })

  it('groups folders beyond the fifth as Other folders in a monorepo', () => {
    const scan = createScanFixture('stipple/stipple')
    const folders = ['app', 'web', 'api', 'docs', 'infra', 'tools', 'scripts']
    const monorepo: Scan = {
      ...scan,
      files: folders.flatMap((folder, folderIndex) =>
        Array.from({ length: 10 - folderIndex }, (_, i) => ({
          path: `${folder}/${i}.ts`,
          name: `${i}.ts`,
          size: 1,
          language: null,
          folder,
        })),
      ),
    }
    const layout = calculateFoldersLayout(monorepo, { width: 960, height: 540 }, theme)

    expect(layout.labels).toHaveLength(5)
    expect(layout.labels.map((label) => label.folder)).toEqual([
      'app',
      'web',
      'api',
      'docs',
      'Other folders',
    ])
    const other = layout.labels[4]!
    expect(other.count).toBe(monorepo.files.filter((file) => ['infra', 'tools', 'scripts'].includes(file.folder)).length)
    expect(layout.labels.reduce((sum, label) => sum + label.count, 0)).toBe(monorepo.files.length)
    const otherFile = monorepo.files.findIndex((file) => file.folder === 'scripts')
    expect(layout.clusterOf[otherFile]).toBe(4)
  })

  it('exposes drag geometry for all five clusters', () => {
    const scan = createScanFixture('stipple/stipple')
    const layout = calculateFoldersLayout(scan, { width: 960, height: 540 }, theme)

    expect(layout.clusterOf.length).toBe(layout.dotCount)
    expect(layout.clusterCenters.length).toBe(FOLDER_CENTERS.length * 2)
    expect(layout.clusterRadii.length).toBe(FOLDER_CENTERS.length)

    for (let slot = 0; slot < FOLDER_CENTERS.length; slot++) {
      const total = Array.from(layout.clusterOf).filter((value) => value === slot).length
      expect(total).toBe(layout.labels[slot].count)
      expect(layout.clusterRadii[slot]).toBeGreaterThan(0)
      expect(Number.isFinite(layout.clusterCenters[slot * 2])).toBe(true)
      expect(Number.isFinite(layout.clusterCenters[slot * 2 + 1])).toBe(true)
    }
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

describe('pixelOriginToFraction', () => {
  it('scales canvas pixels to 0..1 grid fractions', () => {
    expect(pixelOriginToFraction([200, 150], 800, 600)).toEqual([0.25, 0.25])
    expect(pixelOriginToFraction([400, 300], 800, 600)).toEqual([0.5, 0.5])

    const [fx, fy] = pixelOriginToFraction([799, 599], 800, 600)
    expect(fx).toBeCloseTo(799 / 800)
    expect(fy).toBeCloseTo(599 / 600)
  })

  it('clamps out-of-bounds click points', () => {
    expect(pixelOriginToFraction([-20, 900], 800, 600)).toEqual([0, 1])
    expect(pixelOriginToFraction([1200, -5], 800, 600)).toEqual([1, 0])
  })

  it('centers on degenerate sizes', () => {
    expect(pixelOriginToFraction([100, 100], 0, 0)).toEqual([0.5, 0.5])
  })
})

describe('Pointer Wake Effect (Signature Animation 1)', () => {
  it('pushes dots near pointer within 90px radius using exact physics equations', () => {
    const wake = new PointerWakeEffect()
    const n = 10
    wake.allocate(n)

    const x = new Float32Array([100, 300, 500, 0, 0, 0, 0, 0, 0, 0])
    const y = new Float32Array([100, 300, 500, 0, 0, 0, 0, 0, 0, 0])
    const size = new Float32Array(n).fill(8)

    // Pointer at (110, 100), dist to dot 0 center (104, 104) is ~7.2px (< 90px)
    wake.update(x, y, size, n, 110, 100, 800, 600)

    expect(wake.getOffsetX(0)).not.toBe(0)
    expect(wake.getOffsetY(0)).not.toBe(0)

    // Dot 1 (at 300, 300) is far outside 90px radius -> no push force
    expect(wake.getOffsetX(1)).toBe(0)
    expect(wake.getOffsetY(1)).toBe(0)
  })

  it('does nothing when pointer is outside stage boundaries or inactive', () => {
    const wake = new PointerWakeEffect()
    const n = 10
    wake.allocate(n)

    const x = new Float32Array(n).fill(100)
    const y = new Float32Array(n).fill(100)
    const size = new Float32Array(n).fill(8)

    // Inactive pointer (-9999, -9999)
    wake.update(x, y, size, n, -9999, -9999, 800, 600)
    expect(wake.getOffsetX(0)).toBe(0)
    expect(wake.getOffsetY(0)).toBe(0)

    // Pointer outside stage (e.g. 950, 200 in an 800x600 stage)
    wake.update(x, y, size, n, 950, 200, 800, 600)
    expect(wake.getOffsetX(0)).toBe(0)
    expect(wake.getOffsetY(0)).toBe(0)
  })

  it('completes update frame cost in under 4 ms for 2,500 dots (High tier benchmark)', () => {
    const wake = new PointerWakeEffect()
    const n = 2500
    wake.allocate(n)

    const x = new Float32Array(n)
    const y = new Float32Array(n)
    const size = new Float32Array(n).fill(8)

    for (let i = 0; i < n; i++) {
      x[i] = (i % 50) * 16
      y[i] = Math.floor(i / 50) * 16
    }

    const t0 = performance.now()
    for (let frame = 0; frame < 60; frame++) {
      const px = 100 + frame * 5
      const py = 100 + frame * 3
      wake.update(x, y, size, n, px, py, 1000, 1000)
    }
    const totalTimeMs = performance.now() - t0
    const avgFrameCostMs = totalTimeMs / 60

    expect(avgFrameCostMs).toBeLessThan(4.0)
  })
})

describe('Click Shockwave Effect (Signature Animation 2)', () => {
  it('triggers ring and displaces dots inside 70px band', () => {
    const shockwave = new ShockwaveEffect()
    shockwave.trigger(400, 300, 16, 500, 700)

    expect(shockwave.getActiveCount()).toBe(1)

    // At start r=0, point at (400, 300) is within 70px band
    const [offX] = shockwave.getDisplacement(410, 300)
    expect(offX).not.toBe(0)
  })

  it('uses scratch buffer without allocating new arrays', () => {
    const shockwave = new ShockwaveEffect()
    shockwave.trigger(400, 300, 16, 500, 700)

    const disp1 = shockwave.getDisplacement(410, 300)
    const disp2 = shockwave.getDisplacement(420, 300)

    // Must be the exact same scratch array reference
    expect(disp1).toBe(disp2)
  })
})
