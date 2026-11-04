import { describe, expect, it } from 'vitest'
import {
  cycleFocusIndex,
  isRepoPathWithin,
  normalizeRepoPath,
  parentRepoPath,
  repoPathParts,
  structureStaggerDelays,
} from '@/engine/structure-navigation'

describe('normalizeRepoPath', () => {
  it('keeps a clean relative path unchanged', () => {
    expect(normalizeRepoPath('src/components/Button.tsx')).toBe('src/components/Button.tsx')
  })

  it('makes backslashes forward slashes and collapses repeated separators', () => {
    expect(normalizeRepoPath('src\\components\\\\Button.tsx')).toBe('src/components/Button.tsx')
  })

  it('drops leading and trailing separators', () => {
    expect(normalizeRepoPath('/src/components/')).toBe('src/components')
    expect(normalizeRepoPath('///')).toBe('')
  })

  it('drops the current segment and resolves parent segments', () => {
    expect(normalizeRepoPath('./src/./components')).toBe('src/components')
    expect(normalizeRepoPath('src/components/../lib')).toBe('src/lib')
    expect(normalizeRepoPath('../src')).toBe('src')
    expect(normalizeRepoPath('src/../../lib')).toBe('lib')
  })

  it('keeps the root an empty string', () => {
    expect(normalizeRepoPath('')).toBe('')
    expect(normalizeRepoPath('.')).toBe('')
  })
})

describe('repo path helpers', () => {
  it('splits a normalized path into parts', () => {
    expect(repoPathParts('/src//components/')).toEqual(['src', 'components'])
    expect(repoPathParts('')).toEqual([])
  })

  it('returns the parent path', () => {
    expect(parentRepoPath('src/components/Button.tsx')).toBe('src/components')
    expect(parentRepoPath('src')).toBe('')
    expect(parentRepoPath('')).toBe('')
  })

  it('recognizes a path and its descendants, but not name prefixes', () => {
    expect(isRepoPathWithin('src/components', 'src')).toBe(true)
    expect(isRepoPathWithin('src', 'src')).toBe(true)
    expect(isRepoPathWithin('src', '')).toBe(true)
    expect(isRepoPathWithin('src2/components', 'src')).toBe(false)
    expect(isRepoPathWithin('', 'src')).toBe(false)
  })
})

describe('cycleFocusIndex', () => {
  it('wraps in both directions', () => {
    expect(cycleFocusIndex(0, 3, 1)).toBe(1)
    expect(cycleFocusIndex(2, 3, 1)).toBe(0)
    expect(cycleFocusIndex(0, 3, -1)).toBe(2)
    expect(cycleFocusIndex(2, 3, -1)).toBe(1)
  })

  it('starts at the first or last dot when nothing is focused', () => {
    expect(cycleFocusIndex(-1, 4, 1)).toBe(0)
    expect(cycleFocusIndex(-1, 4, -1)).toBe(3)
  })

  it('returns -1 for an empty field', () => {
    expect(cycleFocusIndex(-1, 0, 1)).toBe(-1)
  })
})

describe('structureStaggerDelays', () => {
  const centers = new Float32Array([0, 0, 100, 0, 0, 100])

  it('starts the clicked cluster immediately and ranks the others by distance', () => {
    const groupOf = new Int32Array([0, 0, 1, 2, 2])
    const delays = structureStaggerDelays(groupOf, centers, 5, 0, 0, 4)
    expect(Array.from(delays)).toEqual([0, 0, 4, 8, 8])
  })

  it('uses the requested stagger step', () => {
    const groupOf = new Int32Array([0, 1, 2])
    const delays = structureStaggerDelays(groupOf, centers, 3, 100, 0, 10)
    expect(Array.from(delays)).toEqual([10, 0, 20])
  })

  it('gives hidden dots a zero delay', () => {
    const groupOf = new Int32Array([-1, 0, 1])
    const delays = structureStaggerDelays(groupOf, centers, 3, 0, 0, 4)
    expect(delays[0]).toBe(0)
    expect(delays[1]).toBe(0)
    expect(delays[2]).toBe(4)
  })

  it('returns zeros when there are no clusters', () => {
    const delays = structureStaggerDelays(
      new Int32Array([0, 1]),
      new Float32Array(0),
      2,
      0,
      0,
    )
    expect(Array.from(delays)).toEqual([0, 0])
  })
})
