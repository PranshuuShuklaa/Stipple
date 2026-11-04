import { describe, expect, it } from 'vitest'
import type { RawCommitActivityWeek } from '@/server/github/raw-types'
import {
  activeWeeks,
  busiestWeekday,
  daysFromWeeks,
  headlineFor,
  longestStreakWeeks,
  patternFor,
  pulseFromRaw,
  statusFor,
  sublineFor,
  topWeeksShare,
  totalCommits,
} from '@/server/scan/pulse'

const NOW = new Date('2026-10-20T00:00:00Z')

function week(index: number, total: number, days: number[] = []): RawCommitActivityWeek {
  return {
    week: Math.floor(Date.parse('2025-10-20T00:00:00Z') / 1000) + index * 604800,
    total,
    days,
  }
}

describe('pulse calculations', () => {
  it('creates exactly 364 oldest-first days and pads history before the first week', () => {
    const days = daysFromWeeks([week(51, 2, [1, 0, 0, 0, 0, 1, 0])])
    expect(days).toHaveLength(364)
    expect(days[0]!.commits).toBe(0)
    expect(days.at(-1)).toMatchObject({ commits: 0 })
    expect(days.at(-7)).toMatchObject({ commits: 1 })
    expect(days.at(-2)).toMatchObject({ commits: 1 })
    expect(days[0]!.date < days.at(-1)!.date).toBe(true)
  })

  it('calculates activity, streak, weekday, total and top-week share', () => {
    const weeks = [week(0, 2, [2]), week(1, 0), week(2, 4, [0, 4])]
    expect(activeWeeks(weeks)).toBe(2)
    expect(longestStreakWeeks(weeks)).toBe(1)
    expect(busiestWeekday([
      { date: '2026-01-04', commits: 2 },
      { date: '2026-01-05', commits: 4 },
    ])).toBe(1)
    expect(totalCommits(weeks)).toBe(6)
    expect(topWeeksShare(weeks)).toBe(1)
  })

  it.each([
    [0, 'active'],
    [30, 'active'],
    [31, 'quiet'],
    [180, 'quiet'],
    [181, 'dormant'],
  ] as const)('maps an age of %i days to %s', (age, expected) => {
    const date = new Date(NOW.getTime() - age * 86_400_000).toISOString().slice(0, 10)
    expect(statusFor(date, NOW)).toBe(expected)
  })

  it('treats null and invalid dates as dormant', () => {
    expect(statusFor(null, NOW)).toBe('dormant')
    expect(statusFor('not-a-date', NOW)).toBe('dormant')
  })

  it.each([
    [0, 0.6, 'bursty'],
    [21, 0.39, 'steady'],
    [21, 0.4, 'occasional'],
    [20, 0.2, 'occasional'],
  ] as const)('maps active weeks and concentration to %s', (active, share, expected) => {
    expect(patternFor(active, share)).toBe(expected)
  })

  it('uses the latest daily commit, then pushed_at when days are empty', () => {
    const withCommit = pulseFromRaw([week(51, 1, [0, 0, 0, 0, 0, 0, 1])], '2026-10-01T00:00:00Z', NOW)
    expect(withCommit?.lastCommit).toBe('2026-10-18')
    const fallback = pulseFromRaw([week(51, 0)], '2026-10-01T15:00:00Z', NOW)
    expect(fallback?.lastCommit).toBe('2026-10-01')
    expect(pulseFromRaw([], null, NOW)).toBeNull()
  })

  it('formats the required copy', () => {
    expect(headlineFor('active', '2026-10-18', NOW)).toBe('Active: last commit 2 days ago.')
    expect(headlineFor('quiet', '2026-06-20', NOW)).toBe('Quiet: last commit 4 months ago.')
    expect(headlineFor('dormant', null, NOW)).toBe('Dormant: no commits in over a year.')
    expect(sublineFor(31, 4, 9)).toBe('Commits in 31 of 52 weeks. Busiest day: Thursday. Longest streak: 9 weeks.')
  })
})
