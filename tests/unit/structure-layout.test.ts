import { describe, expect, it } from 'vitest'
import type { Scan, ScanFile } from '@/lib/types/scan'
import { createScanFixture } from '../fixtures/scan-fixture'
import { calculateStructureLayout } from '@/engine/layouts/structure'
import { FOLDER_CENTERS } from '@/engine/layouts/folders'
import { FILES_HERE_LABEL, groupAt } from '@/engine/layouts/structure-groups'

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

function scanFile(path: string, size: number, language: string | null = 'TypeScript'): ScanFile {
  return {
    path,
    name: path.split('/').at(-1) ?? path,
    size,
    language,
    folder: path.includes('/') ? path.slice(0, path.indexOf('/')) : '(root)',
  }
}

function scanWith(files: ScanFile[]): Scan {
  const base = createScanFixture('stipple/stipple')
  return { ...base, files, languages: [] }
}

const files = [
  scanFile('src/index.ts', 10),
  scanFile('src/app.ts', 20),
  scanFile('src/components/Button.tsx', 30),
  scanFile('tests/app.test.ts', 40),
  scanFile('README.md', 50, null),
]

describe('calculateStructureLayout', () => {
  it('places one spiral cluster per group and labels it with the group facts', () => {
    const scan = scanWith(files)
    const layout = calculateStructureLayout(
      scan,
      { width: 960, height: 540 },
      theme,
      '',
      20,
    )

    expect(layout.dotCount).toBe(20)
    expect(layout.focusPath).toBe('')
    expect(layout.breadcrumb).toEqual([])
    expect(layout.groups).toEqual(groupAt(files, ''))
    expect(layout.labels.map((label) => label.folder)).toEqual([
      'src',
      'tests',
      FILES_HERE_LABEL,
    ])
    expect(layout.labels.map((label) => label.count)).toEqual([3, 1, 1])
    expect(layout.labels.map((label) => label.key)).toEqual([
      'folder:src',
      'folder:tests',
      'files-here',
    ])
    expect(layout.labels[0]).toMatchObject({
      path: 'src',
      zoomable: true,
      isFilesHere: false,
      slot: 0,
    })
    expect(layout.labels[2]).toMatchObject({
      path: null,
      zoomable: false,
      isFilesHere: true,
      slot: 2,
    })

    expect(Array.from(layout.groupOf.slice(0, 5))).toEqual([0, 0, 0, 1, 2])
    expect(layout.groupCenters.length).toBe(layout.groups.length * 2)

    for (let index = 0; index < 5; index++) {
      expect(layout.alpha[index]).toBe(1)
      expect(layout.groupOf[index]).toBeGreaterThanOrEqual(0)
    }
    for (let index = 5; index < 20; index++) {
      expect(layout.alpha[index]).toBe(0)
      expect(layout.groupOf[index]).toBe(-1)
    }

    expect([layout.r[0], layout.g[0], layout.b[0]]).toEqual(theme.c1)
    expect([layout.r[3], layout.g[3], layout.b[3]]).toEqual(theme.c2)
    expect([layout.r[4], layout.g[4], layout.b[4]]).toEqual(theme.c3)

    for (let index = 0; index < 20; index++) {
      expect(Number.isFinite(layout.x[index])).toBe(true)
      expect(Number.isFinite(layout.y[index])).toBe(true)
      expect(Number.isFinite(layout.size[index])).toBe(true)
      expect(layout.size[index]).toBeGreaterThanOrEqual(4)
      expect(layout.size[index]).toBeLessThanOrEqual(12)
    }

    for (const label of layout.labels) {
      expect(Number.isFinite(label.x)).toBe(true)
      expect(Number.isFinite(label.y)).toBe(true)
      expect(label.y).toBeGreaterThanOrEqual(20)
      expect(label.y).toBeLessThanOrEqual(540)
    }
  })

  it('regroups around the focus path and reports the breadcrumb', () => {
    const scan = scanWith(files)
    const layout = calculateStructureLayout(
      scan,
      { width: 960, height: 540 },
      theme,
      'src',
      20,
    )

    expect(layout.focusPath).toBe('src')
    expect(layout.breadcrumb).toEqual(['src'])
    expect(layout.labels.map((label) => label.folder)).toEqual([
      'components',
      FILES_HERE_LABEL,
    ])
    expect(layout.labels.map((label) => label.count)).toEqual([1, 2])
    expect(Array.from(layout.groupOf.slice(0, 5))).toEqual([1, 1, 0, -1, -1])
    expect(layout.alpha[0]).toBe(1)
    expect(layout.alpha[1]).toBe(1)
    expect(layout.alpha[2]).toBe(1)
    expect(layout.alpha[3]).toBe(0)
    expect(layout.alpha[4]).toBe(0)
  })

  it('keeps the reference five-cluster positions for five groups', () => {
    const fiveFolders = ['a', 'b', 'c', 'd', 'e'].flatMap((folder) => [
      scanFile(`${folder}/index.ts`, 10),
      scanFile(`${folder}/lib.ts`, 10),
    ])
    const scan = scanWith(fiveFolders)
    const layout = calculateStructureLayout(
      scan,
      { width: 1000, height: 600 },
      theme,
      '',
      10,
    )

    expect(layout.labels).toHaveLength(5)
    FOLDER_CENTERS.forEach(([fractionX, fractionY], slot) => {
      expect(layout.groupCenters[slot * 2]).toBeCloseTo(1000 * fractionX)
      expect(layout.groupCenters[slot * 2 + 1]).toBeCloseTo(600 * fractionY)
      expect(layout.labels[slot]!.x).toBeCloseTo(1000 * fractionX)
    })
  })

  it('merges extra folders into the N other folders label', () => {
    const many = Array.from({ length: 14 }, (_, index) =>
      scanFile(`folder-${String(index + 1).padStart(2, '0')}/index.ts`, 1),
    )
    const scan = scanWith(many)
    const layout = calculateStructureLayout(
      scan,
      { width: 960, height: 540 },
      theme,
      '',
      14,
    )

    expect(layout.groups).toHaveLength(12)
    expect(layout.labels).toHaveLength(12)
    expect(layout.labels[11]!.folder).toBe('3 other folders')
    expect(layout.labels[11]!.path).toBeNull()
    expect(layout.labels[11]!.zoomable).toBe(false)
    expect(Array.from(layout.groupOf).filter((slot) => slot === 11)).toHaveLength(3)

    for (let index = 0; index < 14; index++) {
      const slot = layout.groupOf[index] ?? -1
      expect(slot).toBeGreaterThanOrEqual(0)
      const [cr, cg, cb] = [theme.c1, theme.c2, theme.c3, theme.c4, theme.c5][slot % 5]!
      expect([layout.r[index], layout.g[index], layout.b[index]]).toEqual([cr, cg, cb])
    }
  })

  it('handles an empty tree with a single hidden pool', () => {
    const scan = scanWith([])
    const layout = calculateStructureLayout(
      scan,
      { width: 390, height: 320 },
      theme,
      '',
      364,
    )

    expect(layout.groups).toEqual([])
    expect(layout.labels).toEqual([])
    expect(layout.dotCount).toBe(364)
    expect(layout.breadcrumb).toEqual([])
    for (let index = 0; index < 364; index++) {
      expect(layout.alpha[index]).toBe(0)
      expect(layout.groupOf[index]).toBe(-1)
      expect(Number.isFinite(layout.x[index])).toBe(true)
      expect(Number.isFinite(layout.y[index])).toBe(true)
    }
  })

  it('sums label counts to the visible dots at the focus', () => {
    const deep = [
      ...files,
      scanFile('src/lib/math.ts', 5),
      scanFile('src/lib/array.ts', 6),
      scanFile('src/components/Input.tsx', 7),
    ]
    const scan = scanWith(deep)
    const layout = calculateStructureLayout(
      scan,
      { width: 960, height: 540 },
      theme,
      'src',
      20,
    )

    expect(layout.labels.reduce((sum, label) => sum + label.count, 0)).toBe(6)
    expect(Array.from(layout.groupOf).filter((slot) => slot >= 0)).toHaveLength(6)
  })
})
