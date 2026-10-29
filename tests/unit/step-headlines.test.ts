import { describe, expect, it } from 'vitest'

import type { Scan } from '@/lib/types/scan'
import { createScanFixture } from '@/lib/demo/scan-fixture'
import {
  activityBody,
  activityHeadline,
  biggestFolder,
  buildReportSteps,
  filesBody,
  filesHeadline,
  filesPerDot,
  findBusiestWeek,
  foldersBody,
  foldersHeadline,
  formatCount,
  languagesBody,
  languagesHeadline,
  topLanguage,
} from '@/features/report/step-headlines'

function baseScan(overrides: Partial<Scan> = {}): Scan {
  return {
    owner: 'owner',
    name: 'repo',
    description: '',
    defaultBranch: 'main',
    stars: 0,
    htmlUrl: 'https://github.com/owner/repo',
    files: [],
    languages: [],
    activity: [],
    contributors: [],
    commits: 0,
    health: { score: 0, checks: [] },
    dependencies: [],
    flags: { truncated: false, statsPending: false },
    scannedAt: '2026-10-24T00:00:00.000Z',
    ...overrides,
  }
}

function weeksFrom(commits: number[]): Scan['activity'] {
  return commits.map((value, index) => ({
    week: new Date(Date.UTC(2026, 0, 5 + index * 7)).toISOString().slice(0, 10),
    commits: value,
  }))
}

describe('formatCount', () => {
  it('keeps zeros and small numbers plain and groups thousands', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(999)).toBe('999')
    expect(formatCount(1000)).toBe('1,000')
    expect(formatCount(1_234_567)).toBe('1,234,567')
  })

  it('clamps negative and fractional values to a whole count', () => {
    expect(formatCount(-5)).toBe('0')
    expect(formatCount(249.9)).toBe('249')
  })
})

describe('filesPerDot', () => {
  it('is one dot per file until the cap, then several', () => {
    expect(filesPerDot(0)).toBe(1)
    expect(filesPerDot(240)).toBe(1)
    expect(filesPerDot(2500)).toBe(1)
    expect(filesPerDot(2501)).toBe(2)
    expect(filesPerDot(100_000)).toBe(40)
  })
})

describe('files headlines and bodies', () => {
  it('reports the plain count for normal scans', () => {
    const scan = baseScan({ files: Array.from({ length: 1024 }, (_, i) => ({
      path: `src/f${i}.ts`, name: `f${i}.ts`, size: 10, language: 'TypeScript', folder: 'src',
    })) })
    expect(filesHeadline(scan)).toBe('1,024 files.')
    expect(filesBody(scan)).toContain('Every file is one dot')
  })

  it('uses the singular for a one-file repo', () => {
    const scan = baseScan({
      files: [{ path: 'README.md', name: 'README.md', size: 10, language: null, folder: '(root)' }],
    })
    expect(filesHeadline(scan)).toBe('1 file.')
  })

  it('says the scan is partial when the tree is truncated', () => {
    const scan = baseScan({ flags: { truncated: true, statsPending: false }, files: Array.from({ length: 120_000 }, (_, i) => ({
      path: `s/f${i}.ts`, name: `f${i}.ts`, size: 10, language: 'TypeScript', folder: 's',
    })) })
    expect(filesHeadline(scan)).toBe('First 120,000 files.')
    expect(filesBody(scan)).toContain('first 120,000 files')
  })

  it('points at the legend once one dot covers several files', () => {
    const scan = baseScan({ files: Array.from({ length: 3125 }, (_, i) => ({
      path: `s/f${i}.ts`, name: `f${i}.ts`, size: 10, language: 'TypeScript', folder: 's',
    })) })
    expect(filesBody(scan)).toContain('legend')
  })

  it('has a designed copy for an empty tree', () => {
    const scan = baseScan()
    expect(filesHeadline(scan)).toBe('No files were counted.')
    expect(filesBody(scan)).toContain('nothing to draw')
  })
})

describe('topLanguage and language headlines', () => {
  const scan = baseScan({
    languages: [
      { name: 'TypeScript', bytes: 7000 },
      { name: 'Rust', bytes: 3000 },
    ],
  })

  it('rounds the top language share of all counted bytes', () => {
    expect(topLanguage(scan)).toEqual({ name: 'TypeScript', pct: 70 })
    expect(languagesHeadline(scan)).toBe('70% TypeScript.')
    expect(languagesBody(scan)).toBe('Dots sort into the language bar. TypeScript leads, then Rust.')
  })

  it('reports a dominant language under one percent honestly', () => {
    const thin = baseScan({
      languages: [
        { name: 'Shell', bytes: 9 },
        { name: 'C', bytes: 10_000 },
      ],
    })
    expect(topLanguage(thin)).toEqual({ name: 'Shell', pct: 0 })
    expect(languagesHeadline(thin)).toBe('Shell leads, under 1%.')
  })

  it('handles a single language and missing data', () => {
    const single = baseScan({ languages: [{ name: 'Go', bytes: 5 }] })
    expect(topLanguage(single)).toEqual({ name: 'Go', pct: 100 })
    expect(languagesHeadline(single)).toBe('100% Go.')
    expect(languagesBody(single)).toContain('only counted language')

    const empty = baseScan()
    expect(topLanguage(empty)).toBeNull()
    expect(languagesHeadline(empty)).toBe('Language data is missing.')
    expect(languagesBody(empty)).toContain('no language bytes')
  })
})

describe('findBusiestWeek', () => {
  it('picks the strongest week of the last 16 and names it in weeks ago', () => {
    const commits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 40, 11, 12, 13, 14, 15]
    const scan = baseScan({ activity: weeksFrom(commits) })
    expect(findBusiestWeek(scan)).toEqual({
      week: weeksFrom(commits)[10]!.week,
      commits: 40,
      weeksAgo: 5,
    })
  })

  it('breaks ties toward the most recent week', () => {
    const commits = [40, 0, 0, 0, 0, 0, 0, 0, 0, 40, 0, 0, 0, 0, 0, 0]
    const scan = baseScan({ activity: weeksFrom(commits) })
    const peak = findBusiestWeek(scan)
    expect(peak?.weeksAgo).toBe(6)
    expect(peak?.commits).toBe(40)
  })

  it('returns null while stats are pending, for nothing recorded, and for all-zero weeks', () => {
    expect(findBusiestWeek(baseScan({ flags: { truncated: false, statsPending: true } }))).toBeNull()
    expect(findBusiestWeek(baseScan())).toBeNull()
    expect(findBusiestWeek(baseScan({ activity: weeksFrom([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) }))).toBeNull()
  })
})

describe('activity headlines and bodies', () => {
  it('uses singular and plural weeks correctly', () => {
    expect(activityHeadline(baseScan({ activity: weeksFrom([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) }))).toBe(
      'Busiest week: 15 weeks ago.',
    )
    expect(activityHeadline(baseScan({ activity: weeksFrom([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0]) }))).toBe(
      'Busiest week: 1 week ago.',
    )
    expect(activityHeadline(baseScan({ activity: weeksFrom([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9]) }))).toBe(
      'Busiest week: this week.',
    )
  })

  it('reports each designed fallback in words', () => {
    expect(activityHeadline(baseScan({ flags: { truncated: false, statsPending: true } }))).toBe('Commit stats are still computing.')
    expect(activityBody(baseScan({ flags: { truncated: false, statsPending: true } }))).toContain("hasn't finished")
    expect(activityHeadline(baseScan())).toBe('No weekly commits recorded.')
    expect(activityHeadline(baseScan({ activity: weeksFrom([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) }))).toBe(
      'No commits in 16 weeks.',
    )
  })

  it('names the commit count of the busiest week', () => {
    const scan = baseScan({ activity: weeksFrom([...Array(10).fill(0), 1234, 0, 0, 0, 0, 0]) })
    expect(activityBody(scan)).toContain('1,234 commits')
  })
})

describe('biggestFolder and folder headlines', () => {
  it('counts the top-level folder with the most files', () => {
    const scan = baseScan({
      files: [
        ...Array.from({ length: 40 }, (_, i) => ({ path: `src/${i}.ts`, name: `${i}.ts`, size: 1, language: 'TypeScript', folder: 'src' })),
        ...Array.from({ length: 30 }, (_, i) => ({ path: `lib/${i}.ts`, name: `${i}.ts`, size: 1, language: 'TypeScript', folder: 'lib' })),
        ...Array.from({ length: 5 }, (_, i) => ({ path: `readme${i}.md`, name: `readme${i}.md`, size: 1, language: null, folder: '(root)' })),
      ],
    })
    expect(biggestFolder(scan)).toEqual({ folder: 'src', count: 40 })
    expect(foldersHeadline(scan)).toBe('src is the biggest folder.')
    expect(foldersBody(scan)).toContain('40 of 75 files')
  })

  it('breaks ties alphabetically and ignores the root bucket', () => {
    const scan = baseScan({
      files: [
        { path: 'zeta/a.ts', name: 'a.ts', size: 1, language: null, folder: 'zeta' },
        { path: 'alpha/b.ts', name: 'b.ts', size: 1, language: null, folder: 'alpha' },
        { path: 'rootfile.ts', name: 'rootfile.ts', size: 1, language: null, folder: '(root)' },
      ],
    })
    expect(biggestFolder(scan)).toEqual({ folder: 'alpha', count: 1 })
  })

  it('explains the grouped cluster in a monorepo', () => {
    const scan = baseScan({
      files: ['app', 'web', 'api', 'docs', 'infra', 'tools', 'scripts'].flatMap((folder, folderIndex) =>
        Array.from({ length: 10 - folderIndex }, (_, i) => ({
          path: `${folder}/${i}.ts`, name: `${i}.ts`, size: 1, language: null, folder,
        })),
      ),
    })
    expect(foldersHeadline(scan)).toBe('app is the biggest folder.')
    expect(foldersBody(scan)).toContain('last cluster gathers the smaller top-level folders')
  })

  it('says no folders exist when everything is in the root', () => {
    const scan = baseScan({ files: [{ path: 'main.ts', name: 'main.ts', size: 1, language: null, folder: '(root)' }] })
    expect(biggestFolder(scan)).toBeNull()
    expect(foldersHeadline(scan)).toBe('All files sit in the repo root.')
    expect(foldersBody(scan)).toContain('No top-level folders')
  })
})

describe('buildReportSteps', () => {
  it('orders the four story steps by layout', () => {
    const scan = createScanFixture('stipple/stipple')
    const steps = buildReportSteps(scan)
    expect(steps.map((step) => step.layout)).toEqual(['files', 'languages', 'activity', 'folders'])
  })

  it('stays consistent with each pure helper on a fixture scan', () => {
    const scan = createScanFixture('stipple/stipple')
    const [files, languages, activity, folders] = buildReportSteps(scan)
    expect(files?.headline).toBe(filesHeadline(scan))
    expect(languages?.headline).toBe(languagesHeadline(scan))
    expect(activity?.headline).toBe(activityHeadline(scan))
    expect(folders?.headline).toBe(foldersHeadline(scan))
    expect(files?.headline).toBe('240 files.')
  })

  it('never invents a fixture slot folder name', () => {
    const scan = createScanFixture('stipple/stipple')
    const steps = buildReportSteps(scan)
    for (const step of steps) {
      expect(step.headline).not.toMatch(/folder-\d/)
      expect(step.body).not.toMatch(/folder-\d/)
    }
  })
})
