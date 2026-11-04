import { describe, expect, it } from 'vitest'
import {
  FILES_HERE_LABEL,
  KEEP_NAMED_FOLDERS,
  MAX_NAMED_FOLDERS,
  collectStructureGroups,
  groupAt,
  type StructureFile,
} from '@/engine/layouts/structure-groups'

function file(path: string, size = 10): StructureFile {
  return { path, size }
}

describe('groupAt: next folder segments below the focus path', () => {
  it('groups root folders, nested folder counts and files directly at the root', () => {
    const files = [
      file('src/index.ts'),
      file('src/app.ts'),
      file('src/components/Button.tsx'),
      file('tests/app.test.ts'),
      file('README.md'),
      file('package.json'),
    ]

    const groups = groupAt(files, '')
    expect(groups.map((group) => group.label)).toEqual([
      'src',
      'tests',
      FILES_HERE_LABEL,
    ])
    expect(groups.map((group) => group.count)).toEqual([3, 1, 2])
    expect(groups[0]).toMatchObject({
      key: 'folder:src',
      path: 'src',
      zoomable: true,
      isFilesHere: false,
      isOther: false,
    })
    expect(groups[1]).toMatchObject({ path: 'tests', zoomable: false })
    expect(groups[2]).toMatchObject({
      key: 'files-here',
      path: null,
      zoomable: false,
      isFilesHere: true,
    })

    const assignment = collectStructureGroups(files, '')
    expect(Array.from(assignment.groupOfFile)).toEqual([0, 0, 0, 1, 2, 2])
  })

  it('focuses a deep folder and keeps only its direct children plus (files here)', () => {
    const files = [
      file('src/index.ts'),
      file('src/app.ts'),
      file('src/components/Button.tsx'),
      file('src/components/Input.tsx'),
      file('src/lib/math.ts'),
      file('tests/app.test.ts'),
    ]

    const srcGroups = groupAt(files, 'src')
    expect(srcGroups.map((group) => group.label)).toEqual([
      'components',
      'lib',
      FILES_HERE_LABEL,
    ])
    expect(srcGroups.map((group) => group.count)).toEqual([2, 1, 2])
    expect(srcGroups[0]).toMatchObject({ path: 'src/components', zoomable: false })
    expect(srcGroups[1]).toMatchObject({ path: 'src/lib', zoomable: false })

    const assignment = collectStructureGroups(files, 'src')
    expect(Array.from(assignment.groupOfFile)).toEqual([2, 2, 0, 0, 1, -1])
  })

  it('normalizes leading, trailing, repeated and parent segments', () => {
    const files = [
      file('src/components/Button.tsx'),
      file('src/lib/math.ts'),
    ]

    expect(groupAt(files, '/src/')).toEqual(groupAt(files, 'src'))
    expect(groupAt(files, 'src//components/..')).toEqual(groupAt(files, 'src'))
    expect(groupAt(files, 'src\\components')).toEqual(groupAt(files, 'src/components'))
  })

  it('shows one (files here) bucket when the focus has no subfolders', () => {
    const files = [
      file('src/components/Button.tsx'),
      file('src/components/Input.tsx'),
    ]

    const groups = groupAt(files, 'src/components')
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      label: FILES_HERE_LABEL,
      count: 2,
      path: null,
      zoomable: false,
      isFilesHere: true,
    })
    expect(groupAt(files, 'src/lib')).toEqual([])
  })

  it('returns no groups for an empty tree', () => {
    expect(groupAt([], '')).toEqual([])
    expect(groupAt([], 'src')).toEqual([])
  })

  it(`keeps ${KEEP_NAMED_FOLDERS} names and merges the rest above ${MAX_NAMED_FOLDERS} children`, () => {
    const files = Array.from({ length: 14 }, (_, index) =>
      file(`folder-${String(index + 1).padStart(2, '0')}/index.ts`),
    )

    const groups = groupAt(files, '')
    expect(groups).toHaveLength(12)
    expect(MAX_NAMED_FOLDERS).toBe(12)
    expect(KEEP_NAMED_FOLDERS).toBe(11)

    const named = groups.slice(0, 11)
    expect(named.map((group) => group.label)).toEqual(
      Array.from({ length: 11 }, (_, index) => `folder-${String(index + 1).padStart(2, '0')}`),
    )

    const other = groups[11]!
    expect(other).toMatchObject({
      label: '3 other folders',
      path: null,
      zoomable: false,
      isOther: true,
    })
    expect(other.count).toBe(3)
    expect(other.folders).toEqual(['folder-12', 'folder-13', 'folder-14'])
    expect(other.bytes).toBe(30)
  })

  it('keeps all 12 children when the folder has exactly 12', () => {
    const files = Array.from({ length: 12 }, (_, index) =>
      file(`folder-${String(index + 1).padStart(2, '0')}/index.ts`),
    )

    const groups = groupAt(files, '')
    expect(groups).toHaveLength(12)
    expect(groups.every((group) => !group.isOther)).toBe(true)
    expect(groups.reduce((sum, group) => sum + group.count, 0)).toBe(12)
  })

  it('sorts folders by count, then by name, and sums bytes', () => {
    const files = [
      file('beta/a.ts', 2),
      file('beta/b.ts', 3),
      file('alpha/a.ts', 5),
      file('gamma/a.ts', 7),
      file('gamma/b.ts', 11),
      file('gamma/c.ts', 13),
    ]

    const groups = groupAt(files, '')
    expect(groups.map((group) => group.label)).toEqual(['gamma', 'beta', 'alpha'])
    expect(groups.map((group) => group.bytes)).toEqual([31, 5, 5])
  })
})
