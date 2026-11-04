import type { RawCommitActivityWeek } from '@/server/github/raw-types'
import type { ScanPulse } from '@/lib/types/scan'

const DAY_SECONDS = 86_400
const DAY_MS = DAY_SECONDS * 1000
const WEEK_SECONDS = DAY_SECONDS * 7
const WEEK_COUNT = 52
const DAYS_PER_WEEK = 7

type ActivityWeek = {
  week: number
  total: number
  days: number[]
}

function clampCommits(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : 0
}

function dateFromUnix(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10)
}

function normalizeWeeks(weeks: RawCommitActivityWeek[]): ActivityWeek[] {
  return weeks
    .filter((week) => Number.isInteger(week.week) && week.week > 0)
    .map((week) => ({
      week: week.week,
      total: clampCommits(week.total),
      days: Array.from({ length: DAYS_PER_WEEK }, (_, index) => clampCommits(week.days[index])),
    }))
    .sort((a, b) => a.week - b.week)
    .filter((week, index, all) => index === 0 || week.week !== all[index - 1]!.week)
    .slice(-WEEK_COUNT)
}

function padWeeks(weeks: ActivityWeek[]): ActivityWeek[] {
  if (weeks.length === 0) return []
  const first = weeks[0]!
  const missing = WEEK_COUNT - weeks.length
  return [
    ...Array.from({ length: missing }, (_, index) => ({
      week: first.week - (missing - index) * WEEK_SECONDS,
      total: 0,
      days: Array.from({ length: DAYS_PER_WEEK }, () => 0),
    })),
    ...weeks,
  ]
}

export function daysFromWeeks(weeks: RawCommitActivityWeek[]): ScanPulse['days'] {
  return padWeeks(normalizeWeeks(weeks)).flatMap((week) =>
    week.days.map((commits, index) => ({
      date: dateFromUnix(week.week + index * DAY_SECONDS),
      commits,
    })),
  )
}

export function lastCommit(
  days: ScanPulse['days'],
  pushedAt: string | null,
): string | null {
  return days.filter((day) => day.commits > 0).at(-1)?.date ?? (pushedAt ? pushedAt.slice(0, 10) : null)
}

export function activeWeeks(weeks: Pick<ActivityWeek, 'total'>[]): number {
  return weeks.filter((week) => week.total > 0).length
}

export function longestStreakWeeks(weeks: Pick<ActivityWeek, 'total'>[]): number {
  let longest = 0
  let current = 0
  for (const week of weeks) {
    current = week.total > 0 ? current + 1 : 0
    longest = Math.max(longest, current)
  }
  return longest
}

export function busiestWeekday(days: ScanPulse['days']): number {
  const totals = Array.from({ length: DAYS_PER_WEEK }, () => 0)
  for (const day of days) {
    const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay()
    totals[weekday] += day.commits
  }
  return totals.reduce((best, total, index) => (total > totals[best]! ? index : best), 0)
}

export function totalCommits(weeks: Pick<ActivityWeek, 'total'>[]): number {
  return weeks.reduce((sum, week) => sum + week.total, 0)
}

export function topWeeksShare(weeks: Pick<ActivityWeek, 'total'>[]): number {
  const total = totalCommits(weeks)
  if (total === 0) return 0
  return weeks
    .map((week) => week.total)
    .sort((a, b) => b - a)
    .slice(0, 4)
    .reduce((sum, value) => sum + value, 0) / total
}

export function statusFor(last: string | null, now: Date): ScanPulse['status'] {
  if (last === null) return 'dormant'
  const timestamp = Date.parse(`${last}T00:00:00Z`)
  if (Number.isNaN(timestamp)) return 'dormant'
  const age = Math.max(0, Math.floor((now.getTime() - timestamp) / DAY_MS))
  return age <= 30 ? 'active' : age <= 180 ? 'quiet' : 'dormant'
}

export function patternFor(active: number, share: number): ScanPulse['pattern'] {
  if (share >= 0.6) return 'bursty'
  if (active >= 21 && share < 0.4) return 'steady'
  return 'occasional'
}

function relativeDate(last: string, now: Date): string {
  const timestamp = Date.parse(`${last}T00:00:00Z`)
  const age = Number.isNaN(timestamp) ? null : Math.max(0, Math.floor((now.getTime() - timestamp) / DAY_MS))
  if (age === null) return 'an unknown time ago'
  if (age === 0) return 'today'
  if (age === 1) return '1 day ago'
  if (age < 30) return `${age} days ago`
  const months = Math.floor(age / 30)
  return `${months} month${months === 1 ? '' : 's'} ago`
}

export function headlineFor(status: ScanPulse['status'], last: string | null, now: Date): string {
  if (status === 'dormant' || last === null) return 'Dormant: no commits in over a year.'
  return `${status === 'active' ? 'Active' : 'Quiet'}: last commit ${relativeDate(last, now)}.`
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function sublineFor(active: number, weekday: number, streak: number): string {
  return `Commits in ${active} of 52 weeks. Busiest day: ${WEEKDAYS[weekday] ?? WEEKDAYS[0]}. Longest streak: ${streak} weeks.`
}

export const status = statusFor
export const pattern = patternFor
export const headline = headlineFor
export const subline = sublineFor

export function pulseFromRaw(
  rawWeeks: RawCommitActivityWeek[],
  pushedAt: string | null,
  now: Date,
): ScanPulse | null {
  const weeks = normalizeWeeks(rawWeeks)
  if (weeks.length === 0) return null
  const paddedWeeks = padWeeks(weeks)
  const days = daysFromWeeks(rawWeeks)
  const last = lastCommit(days, pushedAt)
  const active = activeWeeks(paddedWeeks)
  const streak = longestStreakWeeks(paddedWeeks)
  const share = topWeeksShare(paddedWeeks)
  const status = statusFor(last, now)
  return {
    days,
    lastCommit: last,
    activeWeeks: active,
    longestStreakWeeks: streak,
    busiestWeekday: busiestWeekday(days),
    totalCommits: totalCommits(paddedWeeks),
    topWeeksShare: share,
    status,
    pattern: patternFor(active, share),
  }
}
